using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.ScanOrders;

/// Looks up one scanned barcode (a tracking number) and confirms the package is currently
/// out with a courier — the Scan screen only collects packages that are already assigned.
public sealed record ScanOrderQuery(string TrackingNumber) : IRequest<ScannedOrderDto>;

public sealed class ScanOrderQueryHandler : IRequestHandler<ScanOrderQuery, ScannedOrderDto>
{
    // Statuses in which a package is legitimately in a courier's hands (delivery or return pickup).
    private static readonly OrderStatus[] WithCourier =
    {
        OrderStatus.CourierAssignedToDeliver,
        OrderStatus.CourierDeliveringTheOrderToRecipient,
        OrderStatus.DeliveryPostponed,
        OrderStatus.CourierAssignedToPickUp,
        OrderStatus.PickedUpFromRecipient,
    };

    private readonly IAppDbContext _context;
    public ScanOrderQueryHandler(IAppDbContext context) => _context = context;

    public async Task<ScannedOrderDto> Handle(ScanOrderQuery request, CancellationToken cancellationToken)
    {
        string trackingNumber = request.TrackingNumber.Trim().ToUpperInvariant();

        Domain.Order order = await _context.Orders
            .AsNoTracking()
            .Include(o => o.Courier)
            .Include(o => o.GroupOrder)!.ThenInclude(g => g!.Customer)
            .Include(o => o.Customer)
            .FirstOrDefaultAsync(o => o.TrackingNumber == trackingNumber, cancellationToken)
            ?? throw new NotFoundException("Order", trackingNumber);

        if (order.CourierId is null)
            throw new ConflictException($"{trackingNumber} is not assigned to a courier yet.");

        if (!WithCourier.Contains(order.Status))
            throw new ConflictException($"{trackingNumber} is not out with a courier (status: {order.Status}).");

        return ScannedOrderMapper.ToDto(order);
    }
}
