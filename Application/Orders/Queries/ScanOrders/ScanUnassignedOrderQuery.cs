using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Orders.Commands;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.ScanOrders;

/// Looks up one scanned barcode for an Assign scan (admin Assign mode, or a courier claiming
/// parcels for themselves): the package must be claimable per <see cref="UnassignedOrderPolicy"/>.
/// Mirror of <see cref="ScanOrderQuery"/>, which accepts only already-assigned packages.
/// <paramref name="HideCourierName"/> keeps another courier's name out of the rejection message
/// when the caller is a courier.
public sealed record ScanUnassignedOrderQuery(string TrackingNumber, bool HideCourierName = false)
    : IRequest<ScannedOrderDto>;

public sealed class ScanUnassignedOrderQueryHandler : IRequestHandler<ScanUnassignedOrderQuery, ScannedOrderDto>
{
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

        string? holder = request.HideCourierName || order.Courier is null
            ? null
            : $"{order.Courier.FirstName} {order.Courier.LastName}".Trim();

        string? rejection = UnassignedOrderPolicy.Rejection(order, holder);
        if (rejection is not null)
            throw new ConflictException(rejection);

        return ScannedOrderMapper.ToDto(order);
    }
}
