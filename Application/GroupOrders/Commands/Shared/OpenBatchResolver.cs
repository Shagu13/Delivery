using Application.Common.Interfaces;
using Domain;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.Shared;

/// <summary>
/// Locates the customer's still-open batch (GroupOrder) for the current Georgian day.
///
/// A customer keeps one open batch per pickup address per day. Once the courier marks
/// it picked up it leaves <see cref="GroupOrderAppendPolicy.Appendable"/> and the next
/// package starts a fresh batch for the same day — so a single day can hold several
/// batches, of which at most one is open. Callers use this to find that open one
/// instead of assuming their batch is still accepting packages.
///
/// Shared by the cart checkout and the dashboard's "add package" action so the two
/// entry points can never drift apart on what counts as an open batch.
/// </summary>
public static class OpenBatchResolver
{
    /// <summary>
    /// The customer's open batch for today at this pickup address, or null when none is
    /// open (every batch already picked up, or none created yet today).
    /// </summary>
    public static async Task<GroupOrder?> FindOpenBatchAsync(
        IAppDbContext context,
        Guid customerId,
        string pickUpCity,
        string pickUpDistrict,
        string pickUpAddress,
        CancellationToken cancellationToken)
    {
        var today = CustomTime.Today;

        // Status and address are compared in memory: Appendable is a HashSet and the
        // trimmed case-insensitive comparison does not translate to SQL.
        var todaysBatches = await context.GroupOrders
            .Include(g => g.Orders)
            .Where(g => g.CustomerId == customerId && g.CreatedAt.Date == today)
            .OrderBy(g => g.CreatedAt)
            .ToListAsync(cancellationToken);

        return todaysBatches.FirstOrDefault(g =>
            GroupOrderAppendPolicy.Appendable.Contains(g.Status)
            && AddressMatches(g, pickUpCity, pickUpDistrict, pickUpAddress));
    }

    /// <summary>
    /// Same physical pickup location as the batch. The courier only visits one address
    /// per batch, so a differing address must start a fresh batch rather than silently
    /// folding in under the wrong pickup location.
    /// </summary>
    public static bool AddressMatches(
        GroupOrder groupOrder,
        string pickUpCity,
        string pickUpDistrict,
        string pickUpAddress) =>
        string.Equals(groupOrder.PickUpCity.Trim(), pickUpCity.Trim(), StringComparison.OrdinalIgnoreCase)
        && string.Equals(groupOrder.PickUpDistrict.Trim(), pickUpDistrict.Trim(), StringComparison.OrdinalIgnoreCase)
        && string.Equals(groupOrder.PickUpAddress.Trim(), pickUpAddress.Trim(), StringComparison.OrdinalIgnoreCase);
}
