using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers.Queries.Admin;

/// <summary>
/// Admin/Operator read — the pickup-leg mirror of <see cref="GetAssignedOrdersForDayQuery"/>:
/// group-order batches tagged with the courier who collects them, for one Georgian calendar day.
///
/// A batch belongs to a day by its scheduled pickup date (<c>WhenPackagePickedUpDate</c>,
/// else its created date). A day lists:
///   • the batches actually collected that day (dated by PickedUpAt), and
///   • the batches scheduled for that day that are still uncollected and not closed.
/// So an old uncollected batch shows on its own day, not on today's list.
/// </summary>
public sealed record GetAssignedPickupsForDayQuery(DateTime Date) : IRequest<IReadOnlyList<AssignedPickupDto>>;

public sealed class GetAssignedPickupsForDayQueryHandler
    : IRequestHandler<GetAssignedPickupsForDayQuery, IReadOnlyList<AssignedPickupDto>>
{
    // A batch the pickup courier will never collect — excluded from "still out on".
    private static readonly OrderStatus[] ClosedGroupOrderStatuses =
    [
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
        OrderStatus.AllDelivered,
    ];

    private readonly IAppDbContext _context;
    public GetAssignedPickupsForDayQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AssignedPickupDto>> Handle(
        GetAssignedPickupsForDayQuery request, CancellationToken cancellationToken)
    {
        DateTime day    = request.Date.Date;
        DateTime dayEnd = day.AddDays(1);

        IQueryable<GroupOrder> query = _context.GroupOrders
            .AsNoTracking()
            .Where(g => g.CourierId != null)
            .Where(g => (g.PickedUpAt >= day && g.PickedUpAt < dayEnd)
                     || (g.PickedUpAt == null && !ClosedGroupOrderStatuses.Contains(g.Status)
                         && (g.WhenPackagePickedUpDate ?? g.CreatedAt) >= day
                         && (g.WhenPackagePickedUpDate ?? g.CreatedAt) < dayEnd));

        return await query
            .OrderByDescending(g => g.PickedUpAt)
            .Select(g => new AssignedPickupDto(
                g.CourierId,
                g.Id,
                g.SenderBusinessName,
                g.SenderPhone,
                g.PickUpCity,
                g.PickUpDistrict,
                g.PickUpAddress,
                g.NumberOfPackages,
                g.Status.ToString(),
                g.PickedUpAt,
                g.CreatedAt))
            .ToListAsync(cancellationToken);
    }
}
