using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.Shared;

/// <summary>
/// Builds <see cref="Order"/> entities from <see cref="DTOs.CreateOrderDto"/> inputs,
/// resolving the company service fee (explicit override → weight-tier zone price →
/// customer negotiated → district default) and generating tracking numbers.
///
/// Pricing is normally keyed off the recipient (delivery) district, but "swaps" to the
/// batch pickup district when the pickup is NOT in the capital (Tbilisi): e.g. a parcel
/// picked up in Rustavi for delivery to Tbilisi is priced at Rustavi's rate. The swap is
/// suppressed per-tier when the customer has a negotiated price for the tier the RECIPIENT
/// falls into (capital/city/district): a customer's own rate always wins for that zone, so
/// only tiers the customer has NOT negotiated fall back to pickup pricing. Standalone
/// Returns already price off their own pickup district, so the swap only affects
/// Send/Exchange orders.
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
        string? pickUpDistrictName = null)
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

        var districts = await context.Districts
            .AsNoTracking()
            .Where(d => districtNames.Contains(d.DistrictName))
            .ToListAsync(ct);

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

        // Resolve the batch pickup district once. When it exists and is NOT the capital
        // (Tbilisi), Send/Exchange orders are priced off the pickup instead of the recipient.
        var pickUpDistrict = string.IsNullOrWhiteSpace(pickUpDistrictName)
            ? null
            : districts.FirstOrDefault(d =>
                d.DistrictName.Equals(pickUpDistrictName, StringComparison.OrdinalIgnoreCase));
        bool pickUpSwapsPricing = pickUpDistrict is not null && !pickUpDistrict.IsCapitalTerritory;

        var built = new List<Order>(orderDtos.Count);

        for (int i = 0; i < orderDtos.Count; i++)
        {
            var o = orderDtos[i];

            // Pricing district: Returns price off their own pickup; Send/Exchange normally
            // price off the recipient, but swap to the batch pickup when it isn't the capital.
            // The swap is suppressed when the customer has a negotiated price for the tier the
            // recipient falls into — their own rate always wins for that zone (checked per-tier).
            District? district;
            if (o.OrderType == OrderType.Return)
            {
                var returnName = o.ReturnPickupDistrict ?? o.RecipientDistrict;
                district = districts.FirstOrDefault(d =>
                    d.DistrictName.Equals(returnName, StringComparison.OrdinalIgnoreCase));
            }
            else
            {
                var recipientDistrict = districts.FirstOrDefault(d =>
                    d.DistrictName.Equals(o.RecipientDistrict, StringComparison.OrdinalIgnoreCase));

                district = pickUpSwapsPricing && !CustomerHasNegotiatedPriceForTier(customer, recipientDistrict)
                    ? pickUpDistrict
                    : recipientDistrict;
            }

            bool isCapital = district?.IsCapitalTerritory == true;
            bool isCity    = district?.IsCityTerritory    == true;

            decimal companyServicePrice;

            // ── Step 1: explicit override from sender/admin ───────────────────
            if (o.CompanyServicePrice.HasValue && o.CompanyServicePrice.Value > 0)
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
                    : ResolveStandardPrice(customer, district, isCapital, isCity);
            }
            // ── Step 3: standard pricing (customer negotiated → district fallback)
            else
            {
                companyServicePrice = ResolveStandardPrice(customer, district, isCapital, isCity);
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
    /// True when the customer has a negotiated price (&gt; 0) for the tier the recipient
    /// district falls into. When so, the recipient's own zone is priced off the customer's
    /// rate rather than being swapped to the pickup district. Checked per-tier: a customer
    /// who only set a District price is "negotiated" for plain-district recipients but not
    /// for capital/city recipients.
    /// </summary>
    private static bool CustomerHasNegotiatedPriceForTier(Customer? customer, District? recipientDistrict)
    {
        if (customer is null || recipientDistrict is null)
            return false;

        if (recipientDistrict.IsCapitalTerritory)
            return customer.CompanyServiceCapitalPrice is > 0;

        if (recipientDistrict.IsCityTerritory)
            return customer.CompanyServiceCityPrice is > 0;

        return customer.CompanyServiceDistrictPrice is > 0;
    }

    private static decimal ResolveStandardPrice(
        Customer? customer,
        District? district,
        bool isCapital,
        bool isCity)
    {
        if (customer is not null)
        {
            if (isCapital && customer.CompanyServiceCapitalPrice is > 0)
                return customer.CompanyServiceCapitalPrice!.Value;

            if (isCity && customer.CompanyServiceCityPrice is > 0)
                return customer.CompanyServiceCityPrice!.Value;

            if (customer.CompanyServiceDistrictPrice is > 0)
                return customer.CompanyServiceDistrictPrice!.Value;
        }

        return district?.CompanyServicePrice ?? 0;
    }
}
