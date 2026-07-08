using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Domain;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetAllGroupOrders;

/// <summary>
/// Shared GroupOrder/standalone-Order → AdminGroupOrderDto mapping, used by both the
/// paginated list query and the single-by-id lookup so they stay in sync.
/// </summary>
internal static class GroupOrderMapping
{
    public static async Task<(Dictionary<string, string?> CityGeo, Dictionary<string, string?> DistrictGeo)> BuildGeoLookupsAsync(
        IAppDbContext context, CancellationToken ct)
    {
        var cityGeo     = (await context.Cities    .AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(ct))
                            .GroupBy(c => c.CityName)    .ToDictionary(g => g.Key, g => g.First().CityNameGeo);
        var districtGeo = (await context.Districts .AsNoTracking().Where(d => d.DateDeleted == null).ToListAsync(ct))
                            .GroupBy(d => d.DistrictName).ToDictionary(g => g.Key, g => g.First().DistrictNameGeo);
        return (cityGeo, districtGeo);
    }

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
        CancellationComment:              o.CancellationComment);

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
        Orders: go.Orders.OrderBy(o => o.CreatedAt).Select(o => MapOrder(o, cityGeo, districtGeo)).ToList()
    );

    // ── Standalone orders (GroupOrderId == null) as synthetic single-order batches ──
    // Cart checkout with one package stores the order un-batched. Surface each as a
    // group-order-shaped row (flagged IsStandalone) so it appears in the admin list
    // alongside real batches; the sender/pickup come from the owning customer.
    public static AdminGroupOrderDto MapStandalone(Order o, IReadOnlyDictionary<string, string?> cityGeo, IReadOnlyDictionary<string, string?> districtGeo)
    {
        var c = o.Customer;
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
            PickUpCity:              c?.City ?? string.Empty,
            PickUpCityGeo:           c is null ? null : cityGeo.GetValueOrDefault(c.City),
            PickUpDistrict:          c?.District ?? string.Empty,
            PickUpDistrictGeo:       c is null ? null : districtGeo.GetValueOrDefault(c.District),
            PickUpAddress:           c?.Address ?? string.Empty,
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
            Orders:                  new List<AdminOrderDto> { MapOrder(o, cityGeo, districtGeo) },
            IsStandalone:            true);
    }
}
