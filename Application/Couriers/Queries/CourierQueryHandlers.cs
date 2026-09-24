using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Couriers.DTOs;
using Application.GroupOrders.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Courier.Queries;

// ── GetCourierGroupOrders ─────────────────────────────────────────────────────
public sealed class GetCourierGroupOrdersQueryHandler
    : IRequestHandler<GetCourierGroupOrdersQuery, IReadOnlyList<GroupOrderResponseDto>>
{
    private readonly IAppDbContext _context;
    public GetCourierGroupOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<GroupOrderResponseDto>> Handle(
        GetCourierGroupOrdersQuery request, CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CourierUserId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierUserId);

        var activeStatuses = new[]
        {
            OrderStatus.CourierAssignedToPickUp,
            OrderStatus.CourierDeliveringToWarehouse,
        };

        var groupOrders = await _context.GroupOrders
            .Include(go => go.Orders)
            .Include(go => go.Courier)
            .Include(go => go.Warehouse)
            .AsNoTracking()
            .Where(go => go.CourierId == courier.Id && activeStatuses.Contains(go.Status))
            .OrderByDescending(go => go.CreatedAt)
            .ToListAsync(cancellationToken);

        return groupOrders.Select(go => new GroupOrderResponseDto(
            Id:                     go.Id,
            SenderFirstName:        go.SenderFirstName,
            SenderLastName:         go.SenderLastName,
            SenderBusinessName:     go.SenderBusinessName,
            SenderIdNumber:         go.SenderIdNumber ?? string.Empty,
            SenderPhone:            go.SenderPhone,
            AlternativeSenderPhone: go.AlternativeSenderPhone,
            PickUpCity:             go.PickUpCity,
            PickUpDistrict:         go.PickUpDistrict,
            PickUpAddress:          go.PickUpAddress,
            PickUpLatitude:         go.PickUpLatitude,
            PickUpLongitude:        go.PickUpLongitude,
            Note:                   go.Note,
            NumberOfPackages:       go.NumberOfPackages,
            Status:                 go.Status,
            WhenPackagePickedUpDate: go.WhenPackagePickedUpDate,
            CourierId:              go.CourierId,
            CourierFullName:        go.Courier is null ? string.Empty : $"{go.Courier.FirstName} {go.Courier.LastName}",
            CourierPhone:           go.Courier?.PhoneNumber,
            WarehouseId:            go.WarehouseId,
            WarehouseName:          go.Warehouse?.Name,
            CreatedAt:              go.CreatedAt,
            AcceptedAt:             go.AcceptedAt,
            PickedUpAt:             go.PickedUpAt,
            DeliveredToWarehouseAt: go.DeliveredToWarehouseAt,
            Orders: go.Orders
                .OrderBy(o => o.CreatedAt)
                .Select(o => new OrderResponseDto(
                    Id:                      o.Id,
                    TrackingNumber:          o.TrackingNumber,
                    RecipientName:           o.RecipientName,
                    RecipientPhone:          o.RecipientPhone,
                    RecipientCity:           o.RecipientCity,
                    RecipientDistrict:       o.RecipientDistrict,
                    RecipientAddress:        o.RecipientAddress,
                    Description:             o.Description,
                    IsFragile:               o.IsFragile,
                    Status:                  o.Status,
                    ProductPaymentStatus:    o.ProductPaymentStatus,
                    WhoPaysForCompanyService: o.WhoPaysForCompanyService,
                    CourierSalary:           o.CourierSalary,
                    CourierId:               o.CourierId,
                    CourierFullName:         null,
                    WarehouseId:             o.WarehouseId,
                    WarehouseName:           null,
                    CreatedAt:               o.CreatedAt,
                    PickedUpFromWarehouseAt: o.PickedUpFromWarehouseAt,
                    DeliveredAt:             o.DeliveredAt,
                    DeliveryDateFrom:        o.DeliveryDateFrom,
                    DeliveryDateTo:          o.DeliveryDateTo))
                .ToList()
        )).ToList();
    }
}

// ── GetCourierOrders ──────────────────────────────────────────────────────────
public sealed class GetCourierOrdersQueryHandler
    : IRequestHandler<GetCourierOrdersQuery, IReadOnlyList<CourierOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetCourierOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CourierOrderDto>> Handle(
        GetCourierOrdersQuery request, CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CourierUserId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierUserId);

        // Active last-mile statuses shown on the courier's Deliveries tab. Return orders'
        // pickup-phase statuses live on the Pickups tab instead (GetCourierReturnPickupsQuery)
        // even though they're the same Order entity — see that handler.
        var activeStatuses = new[]
        {
            OrderStatus.CourierAssignedToDeliver,
            OrderStatus.CourierDeliveringTheOrderToRecipient,
            OrderStatus.DeliveryPostponed,
        };

        var orders = await _context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder)
            .Where(o => o.CourierId == courier.Id && activeStatuses.Contains(o.Status))
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(cancellationToken);

        return orders.Select(CourierOrderMapping.Map).ToList();
    }
}

// ── GetCourierReturnPickups ───────────────────────────────────────────────────
// Standalone Return orders assigned to this courier, in pickup-phase statuses. Surfaced
// on the Pickups tab (not Deliveries) — the courier's job here is to go collect the parcel
// from the recipient's location (Order.ReturnPickup*), the same kind of job as a sender
// batch pickup, not a last-mile delivery.
public sealed class GetCourierReturnPickupsQueryHandler
    : IRequestHandler<GetCourierReturnPickupsQuery, IReadOnlyList<CourierOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetCourierReturnPickupsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CourierOrderDto>> Handle(
        GetCourierReturnPickupsQuery request, CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CourierUserId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierUserId);

        var activeStatuses = new[]
        {
            OrderStatus.CourierAssignedToPickUp,
            OrderStatus.PickedUpFromRecipient,
        };

        var orders = await _context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder)
            .Include(o => o.Customer)   // standalone Return orders own the customer directly (no GroupOrder)
            .Where(o => o.CourierId == courier.Id && o.OrderType == OrderType.Return
                     && activeStatuses.Contains(o.Status))
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(cancellationToken);

        return orders.Select(CourierOrderMapping.Map).ToList();
    }
}

// ── Shared mapping ────────────────────────────────────────────────────────────
internal static class CourierOrderMapping
{
    public static CourierOrderDto Map(Domain.Order o) => new(
        Id:                      o.Id,
        TrackingNumber:          o.TrackingNumber,
        // Send/Exchange carry the sender name on their GroupOrder; standalone Return orders
        // have no GroupOrder, so fall back to the owning customer's business name.
        SenderBusinessName:      o.GroupOrder?.SenderBusinessName ?? o.Customer?.BusinessName,
        SenderPhone:             o.GroupOrder?.SenderPhone ?? o.Customer?.PhoneNumber,
        RecipientName:           o.RecipientName,
        RecipientPhone:          o.RecipientPhone,
        RecipientCity:           o.RecipientCity,
        RecipientDistrict:       o.RecipientDistrict,
        RecipientAddress:        o.RecipientAddress,
        Latitude:                o.Latitude,
        Longitude:               o.Longitude,
        Description:             o.Description,
        IsFragile:               o.IsFragile,
        OrderType:               o.OrderType,
        ReturnPickupAddress:     o.ReturnPickupAddress,
        ReturnPickupCity:        o.ReturnPickupCity,
        ReturnPickupDistrict:    o.ReturnPickupDistrict,
        Status:                  o.Status,
        ProductPaymentStatus:    o.ProductPaymentStatus,
        WhoPaysForCompanyService: o.WhoPaysForCompanyService,
        AmountToCollectForPackage: o.AmountToCollectForPackage,
        CompanyServicePrice:     o.CompanyServicePrice,
        CreatedAt:               o.CreatedAt,
        AssignedToCourierAt:     o.AssignedToCourierAt,
        PickedUpFromWarehouseAt: o.PickedUpFromWarehouseAt,
        DeliveredAt:             o.DeliveredAt,
        DeliveryDateFrom:        o.DeliveryDateFrom,
        DeliveryDateTo:          o.DeliveryDateTo,
        PostponeReason:          o.PostponeReason,
        PostponeComment:         o.PostponeComment,
        PostponedAt:             o.PostponedAt
    );
}
