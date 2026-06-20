using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetCustomerUnattachedOrders;

/// <summary>
/// A customer's standalone (un-grouped) orders for one day, for the admin grouping modal.
/// </summary>
public sealed record GetCustomerUnattachedOrdersQuery(Guid CustomerId, DateTime Date)
    : IRequest<IReadOnlyList<AdminOrderDto>>;

public sealed class GetCustomerUnattachedOrdersQueryHandler
    : IRequestHandler<GetCustomerUnattachedOrdersQuery, IReadOnlyList<AdminOrderDto>>
{
    private static readonly OrderStatus[] CancelledStatuses =
    {
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    private readonly IAppDbContext _context;
    public GetCustomerUnattachedOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AdminOrderDto>> Handle(
        GetCustomerUnattachedOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var date = request.Date.Date;

        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CustomerId == request.CustomerId
                     && o.GroupOrderId == null
                     && o.CreatedAt.Date == date
                     && !CancelledStatuses.Contains(o.Status))
            .OrderBy(o => o.CreatedAt)
            .ToListAsync(cancellationToken);

        if (orders.Count == 0)
            return Array.Empty<AdminOrderDto>();

        var cityGeo     = (await _context.Cities   .AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(c => c.CityName)    .ToDictionary(g => g.Key, g => g.First().CityNameGeo);
        var districtGeo = (await _context.Districts.AsNoTracking().Where(d => d.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(d => d.DistrictName).ToDictionary(g => g.Key, g => g.First().DistrictNameGeo);

        AdminOrderDto Map(Order o) => new(
            Id:                            o.Id,
            TrackingNumber:                o.TrackingNumber,
            RecipientName:                 o.RecipientName,
            RecipientPhone:                o.RecipientPhone,
            RecipientCity:                 o.RecipientCity,
            RecipientCityGeo:              cityGeo.GetValueOrDefault(o.RecipientCity),
            RecipientDistrict:             o.RecipientDistrict,
            RecipientDistrictGeo:          districtGeo.GetValueOrDefault(o.RecipientDistrict),
            RecipientAddress:              o.RecipientAddress,
            Description:                   o.Description,
            IsFragile:                     o.IsFragile,
            OrderType:                     o.OrderType,
            ReturnPickupAddress:           o.ReturnPickupAddress,
            ReturnPickupCity:              o.ReturnPickupCity,
            ReturnPickupDistrict:          o.ReturnPickupDistrict,
            Status:                        o.Status,
            ProductPaymentStatus:          o.ProductPaymentStatus,
            WhoPaysForCompanyService:      o.WhoPaysForCompanyService,
            AmountToCollectForPackage:     o.AmountToCollectForPackage,
            AmountOfCashCollected:         o.AmountOfCashCollected,
            CourierSalary:                 o.CourierSalary,
            CompanyServicePrice:           o.CompanyServicePrice,
            IsCompanyServicePriceIncluded: o.IsCompanyServicePriceIncluded,
            CompanyRevenue:                o.CompanyRevenue,
            CourierId:                     o.CourierId,
            CreatedAt:                     o.CreatedAt,
            DeliveryDateFrom:              o.DeliveryDateFrom,
            DeliveryDateTo:                o.DeliveryDateTo,
            DeliveredAt:                   o.DeliveredAt);

        return orders.Select(Map).ToList();
    }
}
