using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.Shared;

/// <summary>
/// Builds <see cref="Order"/> entities from <see cref="DTOs.CreateOrderDto"/> inputs,
/// resolving the company service fee (explicit override → weight-tier zone price →
/// customer's per-district special price → customer negotiated tier → district default)
/// and generating tracking numbers.
///
/// <paramref name="allowClientPriceOverride"/> (see <see cref="BuildAsync"/>) gates step 1:
/// a client-submitted <see cref="DTOs.CreateOrderDto.CompanyServicePrice"/> is only ever
/// trusted from an admin/staff caller. Customer- and partner-facing callers must pass
/// <c>false</c> so the fee is always re-derived from steps 2–4 instead of whatever number
/// the caller's own request body happens to contain.
///
/// Pricing is normally keyed off the recipient (delivery) district, but "swaps" to the
/// batch pickup district when the pickup is NOT in the capital (Tbilisi) <b>and</b> the
/// delivery IS the capital: e.g. a parcel picked up in Rustavi for delivery to Tbilisi is
/// priced at Rustavi's rate. A non-capital pickup delivering to another non-capital
/// location prices normally — off the delivery district (its city rate if the delivery
/// district is a city territory, its district rate otherwise).
///
/// The swap moves the *default* (district / weight-tier zone) price only. A customer's
/// negotiated prices are always read off the DELIVERY location's zone, exactly as they are
/// for a capital pickup: delivery to a district → their district rate, to a city → their
/// city rate, to the capital → their capital rate. So a customer with negotiated rates is
/// billed normally, and only a customer with no rate for the delivery zone falls through to
/// the swapped pickup price. Standalone Returns already price off their own pickup district,
/// so the swap only affects Send/Exchange orders.
///
/// Placement is the caller's job: the returned orders carry no GroupOrderId or
/// CustomerId — the create handler adds Send/Exchange to a GroupOrder and stamps
/// standalone Returns with the customer, and the add-to-batch handler appends to an
/// existing GroupOrder. Keeping construction here keeps both paths in lock-step.
/// </summary>
internal static class GroupOrderOrderBuilder
{
    public static async Task<List<Order>> BuildAsync(
        IAppDbContext context,
        ITrackingNumberGenerator trackingGen,
        Customer? customer,
        IReadOnlyList<DTOs.CreateOrderDto> orderDtos,
        CancellationToken ct,
        string? pickUpDistrictName = null,
        bool allowClientPriceOverride = true,
        string? pickUpCityName = null)
    {
        // Load the districts referenced by orders so we can fall back to their default price.
        // For Return orders the fee is based on the return pickup district (where courier collects).
        // The batch pickup district is loaded too — it drives swapped pricing (see below).
        var districtNames = orderDtos
            .Select(o => o.OrderType == OrderType.Return
                ? (o.ReturnPickupDistrict ?? o.RecipientDistrict)
                : o.RecipientDistrict)
            .Append(pickUpDistrictName)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .ToList();

        // District names are NOT unique across cities, so every lookup below is by
        // (city, district name) — see FindDistrict.
        var districts = await context.Districts
            .AsNoTracking()
            .Where(d => d.DateDeleted == null && districtNames.Contains(d.DistrictName))
            .ToListAsync(ct);

        var cityIds = districts.Select(d => d.CityId).Distinct().ToList();
        var cityNames = cityIds.Count > 0
            ? await context.Cities
                .AsNoTracking()
                .Where(c => cityIds.Contains(c.Id))
                .ToDictionaryAsync(c => c.Id, c => c.CityName, ct)
            : new Dictionary<Guid, string>();

        // Bulk-load this customer's per-district special prices for the districts in play —
        // avoids a per-order query, mirroring how weight tiers and districts are loaded above.
        var specialPrices = new Dictionary<Guid, decimal>();
        if (customer is not null)
        {
            var districtIds = districts.Select(d => d.Id).ToList();
            if (districtIds.Count > 0)
            {
                specialPrices = await context.CustomerSpecialPrices
                    .AsNoTracking()
                    .Where(s => s.CustomerId == customer.Id && districtIds.Contains(s.DistrictId))
                    .ToDictionaryAsync(s => s.DistrictId, s => s.Price, ct);
            }
        }

        // Load all weight price tiers referenced by orders (bulk — avoids N+1).
        var tierIds = orderDtos
            .Select(o => o.WeightPriceTierId)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();

        var weightTiers = tierIds.Count > 0
            ? await context.WeightPriceTiers
                .AsNoTracking()
                .Where(t => tierIds.Contains(t.Id) && t.DateDeleted == null)
                .ToListAsync(ct)
            : new List<WeightPriceTier>();

        var trackingNumbers = await trackingGen.GenerateManyAsync(orderDtos.Count, ct);

        // Resolve the batch pickup district once. A pickup outside the capital (Tbilisi) can
        // swap the default price onto itself — but only for orders delivered TO the capital
        // (checked per order below).
        var pickUpDistrict = string.IsNullOrWhiteSpace(pickUpDistrictName)
            ? null
            : FindDistrict(districts, cityNames, pickUpCityName, pickUpDistrictName);
        bool pickUpCanSwapPricing = pickUpDistrict is not null && !pickUpDistrict.IsCapitalTerritory;

        var built = new List<Order>(orderDtos.Count);

        for (int i = 0; i < orderDtos.Count; i++)
        {
            var o = orderDtos[i];

            // Two districts drive the price:
            //   • district        — the *default* pricing zone: Returns price off their own
            //                       pickup; Send/Exchange price off the recipient, swapping to
            //                       the batch pickup only when the pickup isn't the capital
            //                       and the delivery is.
            //   • customerZone    — the zone the customer's negotiated rates are read from.
            //                       Always the delivery location (the return pickup for
            //                       Returns), never the swapped-in batch pickup.
            District? district;
            District? customerZone;
            if (o.OrderType == OrderType.Return)
            {
                var returnName = o.ReturnPickupDistrict ?? o.RecipientDistrict;
                var returnCity = o.ReturnPickupDistrict is not null ? o.ReturnPickupCity : o.RecipientCity;
                district = FindDistrict(districts, cityNames, returnCity, returnName);
                customerZone = district;
            }
            else
            {
                customerZone = FindDistrict(districts, cityNames, o.RecipientCity, o.RecipientDistrict);

                // Swap only for a non-capital pickup delivering INTO the capital. Non-capital
                // → non-capital keeps the delivery district's own zone and default price.
                bool swapToPickUp = pickUpCanSwapPricing && customerZone?.IsCapitalTerritory == true;

                district = swapToPickUp ? pickUpDistrict : customerZone;
            }

            bool isCapital = district?.IsCapitalTerritory == true;
            bool isCity    = district?.IsCityTerritory    == true;

            // Customer-rate zone flags — the delivery location, unaffected by the swap.
            bool custIsCapital = customerZone?.IsCapitalTerritory == true;
            bool custIsCity    = customerZone?.IsCityTerritory    == true;

            decimal companyServicePrice;

            // ── Step 1: explicit override from an admin/staff caller ──────────
            // Only trusted when allowClientPriceOverride is true (admin/walk-in callers).
            // Customer- and partner-facing callers pass false — the client's own preview
            // number is never authoritative; it is always re-derived server-side below.
            if (allowClientPriceOverride
                && o.CompanyServicePrice.HasValue && o.CompanyServicePrice.Value > 0)
            {
                companyServicePrice = o.CompanyServicePrice.Value;
            }
            // ── Step 2: weight tier zone price ────────────────────────────────
            else if (o.WeightPriceTierId.HasValue
                && weightTiers.FirstOrDefault(t => t.Id == o.WeightPriceTierId.Value) is { } tier)
            {
                decimal? zonePrice = isCapital ? tier.CapitalPrice
                                   : isCity    ? tier.CityPrice
                                               : tier.DistrictPrice;

                companyServicePrice = zonePrice is > 0
                    ? zonePrice.Value
                    : ResolveStandardPrice(customer, district, customerZone, specialPrices, custIsCapital, custIsCity);
            }
            // ── Step 3: standard pricing (special price → customer negotiated → district fallback)
            else
            {
                companyServicePrice = ResolveStandardPrice(customer, district, customerZone, specialPrices, custIsCapital, custIsCity);
            }

            decimal? amountToCollect = null;
            if (o.ProductPaymentStatus == PaymentStatus.NotPaid &&
                o.AmountToCollectForPackage is > 0)
            {
                amountToCollect = o.AmountToCollectForPackage;
            }

            // ── "Service price included" handling ─────────────────────────────
            // When the package price is entered all-in (per-order flag OR the customer
            // is flagged at account level), the resolved service fee is the slice baked
            // into that price: keep CompanyServicePrice as the fee and store only the
            // product remainder as COD. Block rather than record a negative product price.
            bool includeService = o.IsCompanyServicePriceIncluded
                || customer?.IsCompanyServicePriceIncludedInPrice == true;

            if (includeService && amountToCollect is decimal gross)
            {
                if (gross < companyServicePrice)
                {
                    throw new Common.Exceptions.ValidationException(new[]
                    {
                        new FluentValidation.Results.ValidationFailure(
                            $"orders[{i}].AmountToCollectForPackage",
                            $"The all-in price ({gross:0.##}) is less than the service fee ({companyServicePrice:0.##}).")
                    });
                }
                amountToCollect = gross - companyServicePrice;
            }

            built.Add(new Order
            {
                RecipientName             = o.RecipientName,
                RecipientPhone            = o.RecipientPhone,
                RecipientCity             = o.RecipientCity,
                RecipientDistrict         = o.RecipientDistrict,
                RecipientAddress          = o.RecipientAddress,
                Description               = o.Description,
                IsFragile                 = o.IsFragile,
                ProductPaymentStatus      = o.ProductPaymentStatus,
                WhoPaysForCompanyService  = o.WhoPaysForCompanyService,
                AmountToCollectForPackage = amountToCollect,
                TrackingNumber            = trackingNumbers[i],
                CompanyServicePrice       = companyServicePrice,
                IsCompanyServicePriceIncluded = includeService,
                WeightPriceTierId         = o.WeightPriceTierId,
                OrderType                 = o.OrderType,
                ReturnPickupAddress       = o.OrderType == OrderType.Return ? o.ReturnPickupAddress  : null,
                ReturnPickupCity          = o.OrderType == OrderType.Return ? o.ReturnPickupCity     : null,
                ReturnPickupDistrict      = o.OrderType == OrderType.Return ? o.ReturnPickupDistrict : null,
                Latitude                  = o.Latitude,
                Longitude                 = o.Longitude,
                ExternalReference         = o.ExternalReference,
            });
        }

        return built;
    }

    /// <summary>
    /// Attaches freshly built packages to an <b>existing</b> batch.
    ///
    /// New packages adopt the batch's current status rather than keeping the default
    /// <see cref="OrderStatus.Pending"/>: the whole batch is collected in a single pickup,
    /// so a package added after the admin assigned a courier is just as "assigned" as the
    /// ones already there. Leaving it Pending made one batch show two different statuses
    /// and misrepresented the package to the customer, admin and courier alike.
    ///
    /// Orders are added explicitly with the FK set — attaching a child with a non-default
    /// client-generated Id to an already-tracked batch would make EF attempt an UPDATE
    /// (0 rows) → DbUpdateConcurrencyException. Explicit Add = INSERT.
    ///
    /// Does not touch <see cref="GroupOrder.NumberOfPackages"/>; the caller owns that,
    /// since it also covers the new-batch case.
    /// </summary>
    public static void AttachToBatch(
        IAppDbContext context,
        GroupOrder batch,
        IReadOnlyList<Order> orders)
    {
        foreach (var order in orders)
        {
            order.GroupOrderId = batch.Id;
            order.Status       = batch.Status;
            context.Orders.Add(order);
        }
    }

    /// <summary>
    /// Resolves a district by (city, district name). District names repeat across cities,
    /// so a name-only match can land on another city's row and mis-price the order
    /// (e.g. a Tbilisi district priced as a village). Falls back to a name-only match only
    /// when no candidate belongs to the given city (legacy/unknown city text).
    /// </summary>
    private static District? FindDistrict(
        IReadOnlyList<District> districts,
        IReadOnlyDictionary<Guid, string> cityNames,
        string? cityName,
        string districtName)
    {
        var byName = districts
            .Where(d => d.DistrictName.Equals(districtName, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (!string.IsNullOrWhiteSpace(cityName))
        {
            var inCity = byName.FirstOrDefault(d =>
                cityNames.TryGetValue(d.CityId, out var n)
                && n.Equals(cityName, StringComparison.OrdinalIgnoreCase));
            if (inCity is not null) return inCity;
        }

        return byName.FirstOrDefault();
    }

    /// <summary>
    /// Special price → customer's negotiated rate for the delivery zone (<paramref name="custIsCapital"/> /
    /// <paramref name="custIsCity"/> describe the DELIVERY district), falling back to
    /// <paramref name="fallbackDistrict"/>'s default price — which is the swapped pickup
    /// district when the swap applies. The special price, like the negotiated tier, is always
    /// read off <paramref name="customerZone"/> (the delivery location), never the swapped-in
    /// pickup district.
    /// </summary>
    private static decimal ResolveStandardPrice(
        Customer? customer,
        District? fallbackDistrict,
        District? customerZone,
        IReadOnlyDictionary<Guid, decimal> specialPrices,
        bool custIsCapital,
        bool custIsCity)
    {
        if (customerZone is not null && specialPrices.TryGetValue(customerZone.Id, out var specialPrice))
            return specialPrice;

        if (customer is not null)
        {
            if (custIsCapital && customer.CompanyServiceCapitalPrice is > 0)
                return customer.CompanyServiceCapitalPrice!.Value;

            if (custIsCity && customer.CompanyServiceCityPrice is > 0)
                return customer.CompanyServiceCityPrice!.Value;

            if (customer.CompanyServiceDistrictPrice is > 0)
                return customer.CompanyServiceDistrictPrice!.Value;
        }

        return fallbackDistrict?.CompanyServicePrice ?? 0;
    }
}
