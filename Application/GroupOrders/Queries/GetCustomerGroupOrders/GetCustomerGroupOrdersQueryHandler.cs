using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Application.GroupOrders.Queries.GetAllGroupOrders;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetCustomerGroupOrders;

public sealed record GetCustomerGroupOrdersQuery(Guid CustomerId)
    : IRequest<IReadOnlyList<AdminGroupOrderDto>>;

public sealed class GetCustomerGroupOrdersQueryHandler
    : IRequestHandler<GetCustomerGroupOrdersQuery, IReadOnlyList<AdminGroupOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomerGroupOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AdminGroupOrderDto>> Handle(
        GetCustomerGroupOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var groupOrders = await _context.GroupOrders
            .Where(g => g.CustomerId == request.CustomerId)
            .Include(g => g.Orders)
            .Include(g => g.Courier)
            .AsNoTracking()
            .OrderByDescending(g => g.CreatedAt)
            .ToListAsync(cancellationToken);

        // Standalone Return orders own the customer directly (no GroupOrder), so the
        // GroupOrders query above never sees them. Fetch them separately and surface each
        // as its own dashboard card. (Exchange orders live inside their GroupOrder and
        // already come through above.)
        var standaloneReturns = await _context.Orders
            .Where(o => o.CustomerId == request.CustomerId && o.GroupOrderId == null)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var customerBusinessName = standaloneReturns.Count == 0
            ? null
            : await _context.Customers
                .Where(c => c.Id == request.CustomerId)
                .Select(c => c.BusinessName)
                .FirstOrDefaultAsync(cancellationToken);

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
            CompanyRevenue:                   o.CompanyRevenue,
            CourierId:                        o.CourierId,
            CreatedAt:                        o.CreatedAt,
            DeliveryDateFrom:                 o.DeliveryDateFrom,
            DeliveryDateTo:                   o.DeliveryDateTo,
            DeliveredAt:                      o.DeliveredAt);

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
            CourierId:               go.CourierId,
            CourierFullName:         go.Courier is null
                ? null
                : $"{go.Courier.FirstName} {go.Courier.LastName}",
            CompanyServiceCapitalPrice:  null,
            CompanyServiceCityPrice:     null,
            CompanyServiceDistrictPrice: null,
            Orders:                  go.Orders.OrderBy(o => o.CreatedAt).Select(MapOrder).ToList()
        ));

        // Wrap each standalone Return as a single-package card so it slots into the same
        // shipments list. The customer is the "sender" getting the parcel back; the pickup
        // is the recipient's address (ReturnPickup*).
        var returnCards = standaloneReturns.Select(o => new AdminGroupOrderDto(
            Id:                      o.Id,
            CreatedAt:               o.CreatedAt,
            Status:                  o.Status,
            CustomerId:              o.CustomerId,
            SenderFirstName:         string.Empty,
            SenderLastName:          string.Empty,
            SenderIdNumber:          null,
            SenderBusinessName:      customerBusinessName ?? string.Empty,
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
            CourierId:               o.CourierId,
            CourierFullName:         null,
            CompanyServiceCapitalPrice:  null,
            CompanyServiceCityPrice:     null,
            CompanyServiceDistrictPrice: null,
            Orders:                  new List<AdminOrderDto> { MapOrder(o) }
        ));

        return groupCards.Concat(returnCards)
            .OrderByDescending(c => c.CreatedAt)
            .ToList();
    }
}
