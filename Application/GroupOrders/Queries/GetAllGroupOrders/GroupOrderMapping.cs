using Application.Common.Interfaces;
using Application.Customers.DTOs;
using Application.Finance;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetAllGroupOrders;

/// <summary>
/// Shared GroupOrder/standalone-Order → AdminGroupOrderDto mapping, used by both the
/// paginated list query and the single-by-id lookup so they stay in sync.
/// </summary>
internal static class GroupOrderMapping
{
    // Cities/Districts are near-static reference data (edited rarely, via admin city
    // management) but were being re-queried in full on every GroupOrders list/detail
    // request. Cache the lookup for a few minutes — worst case a rename is visible a
    // few minutes late, which is a cosmetic geo-name lag, not a correctness issue.
    private const string GeoLookupCacheKey = "grouporders:geo-lookups";
    private static readonly TimeSpan GeoLookupCacheDuration = TimeSpan.FromMinutes(10);

    public static async Task<(Dictionary<string, string?> CityGeo, Dictionary<string, string?> DistrictGeo)> BuildGeoLookupsAsync(
        IAppDbContext context, ICacheService cache, CancellationToken ct)
    {
        var cached = await cache.GetAsync<GeoLookupCacheEntry>(GeoLookupCacheKey, ct);
        if (cached is not null)
            return (cached.CityGeo, cached.DistrictGeo);

        var cityGeo     = (await context.Cities    .AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(ct))
                            .GroupBy(c => c.CityName)    .ToDictionary(g => g.Key, g => g.First().CityNameGeo);
        var districtGeo = (await context.Districts .AsNoTracking().Where(d => d.DateDeleted == null).ToListAsync(ct))
                            .GroupBy(d => d.DistrictName).ToDictionary(g => g.Key, g => g.First().DistrictNameGeo);

        await cache.SetAsync(GeoLookupCacheKey, new GeoLookupCacheEntry(cityGeo, districtGeo), GeoLookupCacheDuration, ct);
        return (cityGeo, districtGeo);
    }

    private sealed record GeoLookupCacheEntry(Dictionary<string, string?> CityGeo, Dictionary<string, string?> DistrictGeo);

    private static IReadOnlyList<CustomerSpecialPriceDto> MapSpecialPrices(Customer? c) =>
        c?.SpecialPrices.Select(s => new CustomerSpecialPriceDto(
            s.Id, s.DistrictId, s.District.DistrictName, s.District.DistrictNameGeo, s.District.City.CityName, s.Price)
        ).ToList()
        ?? new List<CustomerSpecialPriceDto>();

    public static AdminOrderDto MapOrder(Order o, IReadOnlyDictionary<string, string?> cityGeo, IReadOnlyDictionary<string, string?> districtGeo) => new(
        Id:                               o.Id,
        TrackingNumber:                   o.TrackingNumber,
        RecipientName:                    o.RecipientName,
        RecipientPhone:                   o.RecipientPhone,
        RecipientCity:                    o.RecipientCity,
        RecipientCityGeo:                 cityGeo.GetValueOrDefault(o.RecipientCity),
        RecipientDistrict:                o.RecipientDistrict,
        RecipientDistrictGeo:             districtGeo.GetValueOrDefault(o.RecipientDistrict),
        RecipientAddress:                 o.RecipientAddress,
        Description:                      o.Description,
        IsFragile:                        o.IsFragile,
        OrderType:                        o.OrderType,
        ReturnPickupAddress:              o.ReturnPickupAddress,
        ReturnPickupCity:                 o.ReturnPickupCity,
        ReturnPickupDistrict:             o.ReturnPickupDistrict,
        Status:                           o.Status,
        ProductPaymentStatus:             o.ProductPaymentStatus,
        WhoPaysForCompanyService:         o.WhoPaysForCompanyService,
        AmountToCollectForPackage:        o.AmountToCollectForPackage,
        AmountOfCashCollected:            o.AmountOfCashCollected,
        CourierSalary:                    o.CourierSalary,
        CompanyServicePrice:              o.CompanyServicePrice,
        IsCompanyServicePriceIncluded:    o.IsCompanyServicePriceIncluded,
        CompanyRevenue:                   o.CompanyRevenue,
        CourierId:                        o.CourierId,
        CreatedAt:                        o.CreatedAt,
        DeliveryDateFrom:                 o.DeliveryDateFrom,
        DeliveryDateTo:                   o.DeliveryDateTo,
        DeliveredAt:                      o.DeliveredAt,
        CancellationReason:               o.CancellationReason,
        CancellationComment:              o.CancellationComment,
        CancelledReturnedToSenderAt:      o.CancelledReturnedToSenderAt,
        ExpectedCourierCash:              OrderFinance.ExpectedCourierCash(o));

    public static AdminGroupOrderDto MapGroupOrder(GroupOrder go, IReadOnlyDictionary<string, string?> cityGeo, IReadOnlyDictionary<string, string?> districtGeo) => new(
        Id:                      go.Id,
        CreatedAt:               go.CreatedAt,
        Status:                  go.Status,
        CustomerId:              go.CustomerId,
        SenderFirstName:         go.SenderFirstName,
        SenderLastName:          go.SenderLastName,
        SenderIdNumber:          go.SenderIdNumber,
        SenderBusinessName:      go.SenderBusinessName,
        SenderPhone:             go.SenderPhone,
        AlternativeSenderPhone:  go.AlternativeSenderPhone,
        PickUpCity:              go.PickUpCity,
        PickUpCityGeo:           cityGeo.GetValueOrDefault(go.PickUpCity),
        PickUpDistrict:          go.PickUpDistrict,
        PickUpDistrictGeo:       districtGeo.GetValueOrDefault(go.PickUpDistrict),
        PickUpAddress:           go.PickUpAddress,
        Note:                    go.Note,
        NumberOfPackages:        go.NumberOfPackages,
        WhenPackagePickedUpDate: go.WhenPackagePickedUpDate,
        PickedUpAt:              go.PickedUpAt,
        DeliveredToWarehouseAt:  go.DeliveredToWarehouseAt,
        CourierId:               go.CourierId,
        CourierFullName:         go.Courier is null
            ? null
            : $"{go.Courier.FirstName} {go.Courier.LastName}",
        CompanyServiceCapitalPrice:  go.Customer?.CompanyServiceCapitalPrice,
        CompanyServiceCityPrice:     go.Customer?.CompanyServiceCityPrice,
        CompanyServiceDistrictPrice: go.Customer?.CompanyServiceDistrictPrice,
        CustomerSpecialPrices: MapSpecialPrices(go.Customer),
        Orders: go.Orders.OrderBy(o => o.CreatedAt).Select(o => MapOrder(o, cityGeo, districtGeo)).ToList()
    );

    // ── Standalone orders (GroupOrderId == null) as synthetic single-order batches ──
    // Cart checkout with one package stores the order un-batched. Surface each as a
    // group-order-shaped row (flagged IsStandalone) so it appears in the admin list
    // alongside real batches; the sender/pickup come from the owning customer.
    public static AdminGroupOrderDto MapStandalone(Order o, IReadOnlyDictionary<string, string?> cityGeo, IReadOnlyDictionary<string, string?> districtGeo)
    {
        var c = o.Customer;
        // A Return order is collected from the recipient's ReturnPickup* address, never the
        // owning customer's registered business address — Returns are always standalone
        // (never batched, see AddOrdersToGroupOrderCommandValidator), so this is the only
        // place a Return order's pickup location is surfaced as a "batch".
        var isReturnWithPickup = o.OrderType == OrderType.Return && !string.IsNullOrEmpty(o.ReturnPickupCity);
        var pickUpCity     = isReturnWithPickup ? o.ReturnPickupCity!     : c?.City     ?? string.Empty;
        var pickUpDistrict = isReturnWithPickup ? o.ReturnPickupDistrict ?? string.Empty : c?.District ?? string.Empty;
        var pickUpAddress  = isReturnWithPickup ? o.ReturnPickupAddress  ?? string.Empty : c?.Address  ?? string.Empty;
        return new AdminGroupOrderDto(
            Id:                      o.Id,
            CreatedAt:               o.CreatedAt,
            Status:                  o.Status,
            CustomerId:              o.CustomerId,
            SenderFirstName:         c?.FirstName ?? string.Empty,
            SenderLastName:          c?.LastName ?? string.Empty,
            SenderIdNumber:          c?.IdNumber,
            SenderBusinessName:      c?.BusinessName ?? string.Empty,
            SenderPhone:             c?.PhoneNumber ?? string.Empty,
            AlternativeSenderPhone:  null,
            PickUpCity:              pickUpCity,
            PickUpCityGeo:           cityGeo.GetValueOrDefault(pickUpCity),
            PickUpDistrict:          pickUpDistrict,
            PickUpDistrictGeo:       districtGeo.GetValueOrDefault(pickUpDistrict),
            PickUpAddress:           pickUpAddress,
            Note:                    null,
            NumberOfPackages:        1,
            WhenPackagePickedUpDate: null,
            PickedUpAt:              null,
            DeliveredToWarehouseAt:  null,
            CourierId:               o.CourierId,
            CourierFullName:         o.Courier is null
                ? null
                : $"{o.Courier.FirstName} {o.Courier.LastName}",
            CompanyServiceCapitalPrice:  c?.CompanyServiceCapitalPrice,
            CompanyServiceCityPrice:     c?.CompanyServiceCityPrice,
            CompanyServiceDistrictPrice: c?.CompanyServiceDistrictPrice,
            CustomerSpecialPrices:   MapSpecialPrices(c),
            Orders:                  new List<AdminOrderDto> { MapOrder(o, cityGeo, districtGeo) },
            IsStandalone:            true);
    }
}
