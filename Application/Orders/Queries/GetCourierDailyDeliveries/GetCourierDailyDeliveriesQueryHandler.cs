using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.GetCourierDailyDeliveries;

public sealed class GetCourierDailyDeliveriesQueryHandler
    : IRequestHandler<GetCourierDailyDeliveriesQuery, CourierDailyDeliveriesDto>
{
    private readonly IAppDbContext _context;
    public GetCourierDailyDeliveriesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<CourierDailyDeliveriesDto> Handle(
        GetCourierDailyDeliveriesQuery request,
        CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierId);

        var dayStart = request.Date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var dayEnd   = request.Date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == request.CourierId
                     && o.Status == OrderStatus.DeliveredToRecipient
                     && o.DeliveredAt >= dayStart
                     && o.DeliveredAt <= dayEnd)
            .OrderBy(o => o.DeliveredAt)
            .ToListAsync(cancellationToken);

        var orderDtos = orders.Select(o => new CourierDailyOrderDto(
            Id:                  o.Id,
            TrackingNumber:      o.TrackingNumber,
            RecipientName:       o.RecipientName,
            RecipientCity:       o.RecipientCity,
            RecipientDistrict:   o.RecipientDistrict,
            Status:              o.Status,
            DeliveredAt:         o.DeliveredAt,
            CompanyServicePrice: o.CompanyServicePrice,
            CourierSalary:       o.CourierSalary,
            CompanyRevenue:      o.CompanyRevenue
        )).ToList();

        return new CourierDailyDeliveriesDto(
            CourierId:               courier.Id,
            CourierFullName:         $"{courier.FirstName} {courier.LastName}",
            Date:                    request.Date,
            Orders:                  orderDtos,
            TotalCompanyServicePrice: orderDtos.Sum(o => o.CompanyServicePrice),
            TotalCourierSalary:      orderDtos.Sum(o => o.CourierSalary ?? 0),
            TotalCompanyRevenue:     orderDtos.Sum(o => o.CompanyRevenue ?? 0)
        );
    }
}
