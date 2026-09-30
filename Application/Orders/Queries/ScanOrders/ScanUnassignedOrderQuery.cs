using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.ScanOrders;

/// Looks up one scanned barcode for the Scan screen's Assign mode: the package must be a
/// Send/Exchange order sitting in the warehouse (or awaiting its city leg) with no courier yet.
/// Mirror of <see cref="ScanOrderQuery"/>, which accepts only already-assigned packages.
public sealed record ScanUnassignedOrderQuery(string TrackingNumber) : IRequest<ScannedOrderDto>;

public sealed class ScanUnassignedOrderQueryHandler : IRequestHandler<ScanUnassignedOrderQuery, ScannedOrderDto>
{
    // Same "ready for a delivery courier" statuses BulkAssignCourierToOrdersCommandHandler
    // accepts for a first assignment.
    private static readonly OrderStatus[] AwaitingAssignment =
    {
        OrderStatus.AdminAcceptedOrderInWareHouse,
        OrderStatus.OrderIsOnItsWayToRecipientsCity,
    };

    private readonly IAppDbContext _context;
    public ScanUnassignedOrderQueryHandler(IAppDbContext context) => _context = context;

    public async Task<ScannedOrderDto> Handle(ScanUnassignedOrderQuery request, CancellationToken cancellationToken)
    {
        string trackingNumber = request.TrackingNumber.Trim().ToUpperInvariant();

        Domain.Order order = await _context.Orders
            .AsNoTracking()
            .Include(o => o.Courier)
            .Include(o => o.GroupOrder)!.ThenInclude(g => g!.Customer)
            .Include(o => o.Customer)
            .FirstOrDefaultAsync(o => o.TrackingNumber == trackingNumber, cancellationToken)
            ?? throw new NotFoundException("Order", trackingNumber);

        if (order.OrderType == OrderType.Return)
            throw new ConflictException($"{trackingNumber} is a return order — assign it from the Returns page.");

        if (order.CourierId is not null)
            throw new ConflictException(
                $"{trackingNumber} is already assigned to {order.Courier?.FirstName} {order.Courier?.LastName}.".Replace("  ", " "));

        if (order.Status == OrderStatus.DeliveredToWarehouse)
            throw new ConflictException($"{trackingNumber} has not been accepted in the warehouse yet — accept it first.");

        if (!AwaitingAssignment.Contains(order.Status))
            throw new ConflictException($"{trackingNumber} is not waiting for a courier (status: {order.Status}).");

        return ScannedOrderMapper.ToDto(order);
    }
}
