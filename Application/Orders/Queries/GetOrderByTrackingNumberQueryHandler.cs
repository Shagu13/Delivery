using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Orders.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.GetOrderByTrackingNumber;

public sealed class GetOrderByTrackingNumberQueryHandler
    : IRequestHandler<GetOrderByTrackingNumberQuery, TrackOrderDto>
{
    private readonly IAppDbContext _context;
    public GetOrderByTrackingNumberQueryHandler(IAppDbContext context) => _context = context;

    public async Task<TrackOrderDto> Handle(
        GetOrderByTrackingNumberQuery request,
        CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .AsNoTracking()
            .Include(o => o.Courier)
            .Include(o => o.Warehouse)
            .Include(o => o.TrackingEvents.OrderBy(e => e.CreatedAt))
            .FirstOrDefaultAsync(
                o => o.TrackingNumber == request.TrackingNumber,
                cancellationToken)
            ?? throw new NotFoundException("Order", request.TrackingNumber);

        return new TrackOrderDto(
            OrderId:                order.Id,
            TrackingNumber:         order.TrackingNumber,
            Status:                 order.Status,
            RecipientName:          order.RecipientName,
            RecipientCity:          order.RecipientCity,
            RecipientDistrict:      order.RecipientDistrict,
            RecipientAddress:       order.RecipientAddress,
            IsFragile:              order.IsFragile,
            CourierFullName:        order.Courier is null
                ? null
                : $"{order.Courier.FirstName} {order.Courier.LastName}",
            WarehouseName:          order.Warehouse?.Name,
            CreatedAt:              order.CreatedAt,
            PickedUpFromWarehouseAt: order.PickedUpFromWarehouseAt,
            DeliveredAt:            order.DeliveredAt,
            DeliveryDateFrom:       order.DeliveryDateFrom,
            DeliveryDateTo:         order.DeliveryDateTo,
            TrackingEvents:         order.TrackingEvents
                .Select(e => new TrackingEventDto(e.Status, e.Description, e.CreatedAt))
                .ToList()
        );
    }
}
