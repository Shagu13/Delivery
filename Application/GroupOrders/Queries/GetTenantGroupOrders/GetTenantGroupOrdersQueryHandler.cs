using Application.Common.Interfaces;
using Application.Customers.DTOs;
using Application.Finance;
using Application.GroupOrders.DTOs;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetTenantGroupOrders;

/// <summary>
/// All group orders (and standalone Returns) owned by a tenant's sub-customers, for the
/// co-admin (TenantAdmin) order-acceptance view. Scoped strictly to <paramref name="TenantId"/>;
/// the caller passes the tenant id from the JWT claim — never from the request body.
/// Mirrors <c>GetCustomerGroupOrders</c> one level up (tenant instead of single customer).
/// </summary>
public sealed record GetTenantGroupOrdersQuery(Guid TenantId)
    : IRequest<IReadOnlyList<AdminGroupOrderDto>>;

public sealed class GetTenantGroupOrdersQueryHandler
    : IRequestHandler<GetTenantGroupOrdersQuery, IReadOnlyList<AdminGroupOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetTenantGroupOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AdminGroupOrderDto>> Handle(
        GetTenantGroupOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var groupOrders = await _context.GroupOrders
            .Where(g => g.Customer != null && g.Customer.TenantId == request.TenantId)
            .Include(g => g.Orders)
            .Include(g => g.Courier)
            .AsNoTracking()
            .OrderByDescending(g => g.CreatedAt)
            .ToListAsync(cancellationToken);

        // Standalone Return orders own the customer directly (no GroupOrder), so the query
        // above never sees them. Fetch the tenant's separately and surface each as its own card.
        var standaloneReturns = await _context.Orders
            .Where(o => o.GroupOrderId == null && o.Customer != null && o.Customer.TenantId == request.TenantId)
            .Include(o => o.Customer)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var cityGeo     = (await _context.Cities   .AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(c => c.CityName)    .ToDictionary(g => g.Key, g => g.First().CityNameGeo);
        var districtGeo = (await _context.Districts.AsNoTracking().Where(d => d.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(d => d.DistrictName).ToDictionary(g => g.Key, g => g.First().DistrictNameGeo);

        AdminOrderDto MapOrder(Order o) => new AdminOrderDto(
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
            CustomerSurcharge:                o.CustomerSurcharge,
            // Company margin is dilo-internal — never surfaced to a tenant co-admin.
            CompanyRevenue:                   null,
            CourierId:                        o.CourierId,
            CreatedAt:                        o.CreatedAt,
            DeliveryDateFrom:                 o.DeliveryDateFrom,
            DeliveryDateTo:                   o.DeliveryDateTo,
            DeliveredAt:                      o.DeliveredAt,
            CancellationReason:               o.CancellationReason,
            CancellationComment:              o.CancellationComment,
            ExpectedCourierCash:              OrderFinance.ExpectedCourierCash(o));

        var groupCards = groupOrders.Select(go => new AdminGroupOrderDto(
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
            CompanyServiceCapitalPrice:  null,
            CompanyServiceCityPrice:     null,
            CompanyServiceDistrictPrice: null,
            CustomerSpecialPrices:   new List<CustomerSpecialPriceDto>(),
            Orders:                  go.Orders.OrderBy(o => o.CreatedAt).Select(MapOrder).ToList()
        ));

        var returnCards = standaloneReturns.Select(o => new AdminGroupOrderDto(
            Id:                      o.Id,
            CreatedAt:               o.CreatedAt,
            Status:                  o.Status,
            CustomerId:              o.CustomerId,
            SenderFirstName:         string.Empty,
            SenderLastName:          string.Empty,
            SenderIdNumber:          null,
            SenderBusinessName:      o.Customer?.BusinessName ?? string.Empty,
            SenderPhone:             string.Empty,
            AlternativeSenderPhone:  null,
            PickUpCity:              o.ReturnPickupCity     ?? o.RecipientCity,
            PickUpCityGeo:           cityGeo.GetValueOrDefault(o.ReturnPickupCity ?? o.RecipientCity),
            PickUpDistrict:          o.ReturnPickupDistrict ?? o.RecipientDistrict,
            PickUpDistrictGeo:       districtGeo.GetValueOrDefault(o.ReturnPickupDistrict ?? o.RecipientDistrict),
            PickUpAddress:           o.ReturnPickupAddress  ?? o.RecipientAddress,
            Note:                    null,
            NumberOfPackages:        1,
            WhenPackagePickedUpDate: null,
            PickedUpAt:              null,
            DeliveredToWarehouseAt:  o.DeliveredToWarehouseAt,
            CourierId:               o.CourierId,
            CourierFullName:         null,
            CompanyServiceCapitalPrice:  null,
            CompanyServiceCityPrice:     null,
            CompanyServiceDistrictPrice: null,
            CustomerSpecialPrices:   new List<CustomerSpecialPriceDto>(),
            Orders:                  new List<AdminOrderDto> { MapOrder(o) }
        ));

        return groupCards.Concat(returnCards)
            .OrderByDescending(c => c.CreatedAt)
            .ToList();
    }
}
