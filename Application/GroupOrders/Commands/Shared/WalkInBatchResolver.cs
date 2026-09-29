using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.Shared;

/// <summary>
/// Locates a walk-in customer's still-open walk-in batch (GroupOrder) for the current
/// Georgian day, so a repeat "+ Add Package" submission the same day folds into it instead
/// of starting a new batch every time.
///
/// This is deliberately a separate rule from <see cref="OpenBatchResolver"/>: a walk-in
/// batch is created already at <see cref="OrderStatus.AdminAcceptedOrderInWareHouse"/> (it
/// skips the pickup leg entirely, since the parcel was handed over at the office), a status
/// outside <see cref="GroupOrderAppendPolicy"/>'s "still open" set. There is no
/// courier-pickup event to close a walk-in batch on, so it simply stays open for the rest
/// of the Georgian calendar day. It also never folds a walk-in order into a batch the same
/// customer has open from their own web/Partner-API orders (or vice versa) — the
/// <see cref="GroupOrder.IsWalkIn"/> filter keeps the two channels' batches separate.
/// </summary>
public static class WalkInBatchResolver
{
    public static async Task<GroupOrder?> FindOpenBatchAsync(
        IAppDbContext context,
        Guid customerId,
        string pickUpCity,
        string pickUpDistrict,
        string pickUpAddress,
        CancellationToken cancellationToken)
    {
        var today = CustomTime.Today;

        var todaysWalkInBatches = await context.GroupOrders
            .Where(g => g.CustomerId == customerId
                     && g.IsWalkIn
                     && g.CreatedAt.Date == today
                     && g.Status != OrderStatus.CancelledByAdmin
                     && g.Status != OrderStatus.CancelledBySender
                     && g.Status != OrderStatus.OrderNotAccepted)
            .OrderBy(g => g.CreatedAt)
            .ToListAsync(cancellationToken);

        return todaysWalkInBatches.FirstOrDefault(g =>
            OpenBatchResolver.AddressMatches(g, pickUpCity, pickUpDistrict, pickUpAddress));
    }
}
