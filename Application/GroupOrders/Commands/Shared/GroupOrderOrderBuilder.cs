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
        CancellationToken ct)
    {
        // Load the districts referenced by orders so we can fall back to their default price.
        // For Return orders the fee is based on the return pickup district (where courier collects).
        var districtNames = orderDtos
            .Select(o => o.OrderType == OrderType.Return
                ? (o.ReturnPickupDistrict ?? o.RecipientDistrict)
                : o.RecipientDistrict)
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

        var built = new List<Order>(orderDtos.Count);

        for (int i = 0; i < orderDtos.Count; i++)
        {
            var o = orderDtos[i];

            var districtName = o.OrderType == OrderType.Return
                ? (o.ReturnPickupDistrict ?? o.RecipientDistrict)
                : o.RecipientDistrict;

            var district = districts.FirstOrDefault(d =>
                d.DistrictName.Equals(districtName, StringComparison.OrdinalIgnoreCase));

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
