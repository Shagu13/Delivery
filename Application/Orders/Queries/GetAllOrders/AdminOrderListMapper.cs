using Application.Common.Interfaces;
using Application.Finance;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.GetAllOrders;

/// <summary>
/// The one place an <see cref="Domain.Order"/> becomes an <see cref="AdminOrderListDto"/>. Shared by the
/// Delivery/Packages list and the Couriers "Completed" tab so the order view modal gets an identical shape.
/// The order must be loaded with GroupOrder, Customer and Courier included.
/// </summary>
internal static class AdminOrderListMapper
{
    /// <summary>Georgian city/district names keyed by English name (active rows only), loaded in one round trip each.</summary>
    internal sealed record GeoNames(
        IReadOnlyDictionary<string, string?> Cities,
        IReadOnlyDictionary<string, string?> Districts);

    internal static async Task<GeoNames> LoadGeoNamesAsync(IAppDbContext context, CancellationToken cancellationToken)
    {
        Dictionary<string, string?> cityGeo = (await context.Cities.AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(cancellationToken))
            .GroupBy(c => c.CityName).ToDictionary(g => g.Key, g => (string?)g.First().CityNameGeo);
        Dictionary<string, string?> districtGeo = (await context.Districts.AsNoTracking().Where(d => d.DateDeleted == null).ToListAsync(cancellationToken))
            .GroupBy(d => d.DistrictName).ToDictionary(g => g.Key, g => (string?)g.First().DistrictNameGeo);
        return new GeoNames(cityGeo, districtGeo);
    }

    /// <param name="hideCompanyRevenue">Company margin is dilo-internal — hidden from a tenant co-admin and an operator.</param>
    internal static AdminOrderListDto ToDto(Domain.Order o, GeoNames geo, bool hideCompanyRevenue) => new(
        Id:                       o.Id,
        TrackingNumber:           o.TrackingNumber,
        SenderBusinessName:       o.GroupOrder?.SenderBusinessName ?? o.Customer?.BusinessName ?? string.Empty,
        SenderFirstName:          o.GroupOrder?.SenderFirstName    ?? o.Customer?.FirstName    ?? string.Empty,
        SenderLastName:           o.GroupOrder?.SenderLastName     ?? o.Customer?.LastName     ?? string.Empty,
        SenderPhone:              o.GroupOrder?.SenderPhone        ?? o.Customer?.PhoneNumber  ?? string.Empty,
        AlternativeSenderPhone:   o.GroupOrder?.AlternativeSenderPhone,
        GroupOrderId:             o.GroupOrderId,
        PickUpCity:               o.GroupOrder?.PickUpCity     ?? o.Customer?.City     ?? string.Empty,
        PickUpDistrict:           o.GroupOrder?.PickUpDistrict ?? o.Customer?.District ?? string.Empty,
        PickUpAddress:            o.GroupOrder?.PickUpAddress  ?? o.Customer?.Address  ?? string.Empty,
        // Batched orders carry the batch's stamped pin; standalone orders fall back
        // to the owning customer's saved pin.
        PickUpLatitude:           o.GroupOrder != null ? o.GroupOrder.PickUpLatitude  : o.Customer != null ? o.Customer.Latitude  : null,
        PickUpLongitude:          o.GroupOrder != null ? o.GroupOrder.PickUpLongitude : o.Customer != null ? o.Customer.Longitude : null,
        RecipientName:            o.RecipientName,
        RecipientPhone:           o.RecipientPhone,
        RecipientCity:            o.RecipientCity,
        RecipientCityGeo:         geo.Cities.GetValueOrDefault(o.RecipientCity),
        RecipientDistrict:        o.RecipientDistrict,
        RecipientDistrictGeo:     geo.Districts.GetValueOrDefault(o.RecipientDistrict),
        RecipientAddress:         o.RecipientAddress,
        Description:              o.Description,
        IsFragile:                o.IsFragile,
        OrderType:                o.OrderType.ToString(),
        Status:                   o.Status.ToString(),
        ProductPaymentStatus:     o.ProductPaymentStatus.ToString(),
        WhoPaysForCompanyService: o.WhoPaysForCompanyService.ToString(),
        ReturnPickupAddress:      o.ReturnPickupAddress,
        ReturnPickupCity:         o.ReturnPickupCity,
        ReturnPickupDistrict:     o.ReturnPickupDistrict,
        AmountToCollectForPackage:o.AmountToCollectForPackage,
        CompanyServicePrice:      o.CompanyServicePrice,
        IsCompanyServicePriceIncluded: o.IsCompanyServicePriceIncluded,
        CustomerSurcharge:        o.CustomerSurcharge,
        CourierSalary:            o.CourierSalary,
        CompanyRevenue:           hideCompanyRevenue ? null : o.CompanyRevenue,
        CourierId:                o.CourierId,
        CourierFullName:          o.Courier == null ? null : $"{o.Courier.FirstName} {o.Courier.LastName}".Trim(),
        CreatedAt:                o.CreatedAt,
        DeliveredAt:              o.DeliveredAt,
        PostponeReason:           o.PostponeReason == null ? null : o.PostponeReason.Value.ToString(),
        PostponeComment:          o.PostponeComment,
        ExpectedCourierCash:      OrderFinance.ExpectedCourierCash(o)
    );
}
