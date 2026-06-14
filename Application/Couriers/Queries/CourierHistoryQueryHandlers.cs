using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Application.Orders.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Courier.Queries;

// ── GetCourierDeliveryHistory ─────────────────────────────────────────────────

public sealed class GetCourierDeliveryHistoryQueryHandler
    : IRequestHandler<GetCourierDeliveryHistoryQuery, IReadOnlyList<CourierOrderHistoryDto>>
{
    private readonly IAppDbContext _context;
    public GetCourierDeliveryHistoryQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CourierOrderHistoryDto>> Handle(
        GetCourierDeliveryHistoryQuery request, CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CourierUserId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierUserId);

        // Terminal statuses from the courier's last-mile perspective
        var terminalStatuses = new[]
        {
            OrderStatus.DeliveredToRecipient,
            OrderStatus.CancelledByAdmin,
        };

        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == courier.Id && terminalStatuses.Contains(o.Status))
            .OrderByDescending(o => o.DeliveredAt ?? o.CreatedAt)
            .ToListAsync(cancellationToken);

        return orders.Select(o => new CourierOrderHistoryDto(
            Id:                 o.Id,
            RecipientName:      o.RecipientName,
            RecipientCity:      o.RecipientCity,
            RecipientDistrict:  o.RecipientDistrict,
            RecipientAddress:   o.RecipientAddress,
            Description:        o.Description,
            IsFragile:          o.IsFragile,
            Status:             o.Status,
            CreatedAt:          o.CreatedAt,
            DeliveredAt:        o.DeliveredAt
        )).ToList();
    }
}

// ── GetCourierPickupHistory ───────────────────────────────────────────────────

public sealed class GetCourierPickupHistoryQueryHandler
    : IRequestHandler<GetCourierPickupHistoryQuery, IReadOnlyList<CourierPickupHistoryDto>>
{
    private readonly IAppDbContext _context;
    public GetCourierPickupHistoryQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CourierPickupHistoryDto>> Handle(
        GetCourierPickupHistoryQuery request, CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CourierUserId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierUserId);

        // Statuses that represent a completed or post-warehouse group order
        var completedStatuses = new[]
        {
            OrderStatus.DeliveredToWarehouse,
            OrderStatus.AdminAcceptedOrderInWareHouse,
            OrderStatus.OrderIsOnItsWayToRecipientsCity,
            OrderStatus.CourierAssignedToDeliver,
            OrderStatus.AllDelivered,
            OrderStatus.CancelledByAdmin,
        };

        var groupOrders = await _context.GroupOrders
            .AsNoTracking()
            .Where(go => go.CourierId == courier.Id && completedStatuses.Contains(go.Status))
            .OrderByDescending(go => go.DeliveredToWarehouseAt ?? go.CreatedAt)
            .ToListAsync(cancellationToken);

        return groupOrders.Select(go => new CourierPickupHistoryDto(
            Id:                    go.Id,
            SenderFirstName:       go.SenderFirstName,
            SenderLastName:        go.SenderLastName,
            SenderBusinessName:    go.SenderBusinessName,
            PickUpCity:            go.PickUpCity,
            PickUpDistrict:        go.PickUpDistrict,
            PickUpAddress:         go.PickUpAddress,
            Note:                  go.Note,
            NumberOfPackages:      go.NumberOfPackages,
            Status:                go.Status,
            CreatedAt:             go.CreatedAt,
            PickedUpAt:            go.PickedUpAt,
            DeliveredToWarehouseAt: go.DeliveredToWarehouseAt
        )).ToList();
    }
}
