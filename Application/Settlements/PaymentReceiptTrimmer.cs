using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements;

/// <summary>
/// Shrinks the <see cref="PaymentReceiptAllocation"/>s of ONE order, per money flow, when an admin edit
/// makes part of an already-recorded payment no longer valid (a lower salary, a changed service-fee payer).
/// Newest receipt is trimmed first; receipt totals are reduced by the same amount and any receipt left
/// with no allocation is removed, so history, the order's paid amount and the receipt totals stay in step.
/// Shared by <see cref="CourierSalaryReceiptReconciler"/> and the payer-change command — one rule, one place.
/// The caller saves.
/// </summary>
public static class PaymentReceiptTrimmer
{
    private const decimal Epsilon = 0.005m;

    public static Task TrimAsync(
        IAppDbContext context,
        Guid orderId,
        IReadOnlyDictionary<PaymentReceiptFlow, decimal> excessByFlow,
        CancellationToken ct) =>
        TrimManyAsync(context, new Dictionary<Guid, IReadOnlyDictionary<PaymentReceiptFlow, decimal>> { [orderId] = excessByFlow }, ct);

    /// <summary>Same rule for many orders at once: ONE allocation query for the whole set (no query per order).</summary>
    public static async Task TrimManyAsync(
        IAppDbContext context,
        IReadOnlyDictionary<Guid, IReadOnlyDictionary<PaymentReceiptFlow, decimal>> excessByOrder,
        CancellationToken ct)
    {
        Dictionary<Guid, Dictionary<PaymentReceiptFlow, decimal>> remaining = excessByOrder
            .Select(o => (o.Key, Flows: o.Value.Where(kv => kv.Value > Epsilon).ToDictionary(kv => kv.Key, kv => kv.Value)))
            .Where(x => x.Flows.Count > 0)
            .ToDictionary(x => x.Key, x => x.Flows);
        if (remaining.Count == 0) return;

        List<Guid> orderIds = remaining.Keys.ToList();
        List<PaymentReceiptFlow> flows = remaining.Values.SelectMany(f => f.Keys).Distinct().ToList();

        // Newest receipt first, so the most recent payment is the one reduced.
        List<PaymentReceiptAllocation> allocations = await context.PaymentReceiptAllocations
            .Include(a => a.PaymentReceipt)
            .Where(a => orderIds.Contains(a.OrderId) && flows.Contains(a.PaymentReceipt!.Flow))
            .OrderByDescending(a => a.PaymentReceipt!.PaidAt)
            .ToListAsync(ct);

        foreach (PaymentReceiptAllocation alloc in allocations)
        {
            PaymentReceiptFlow flow = alloc.PaymentReceipt!.Flow;
            if (!remaining.TryGetValue(alloc.OrderId, out Dictionary<PaymentReceiptFlow, decimal>? byFlow)
                || !byFlow.TryGetValue(flow, out decimal excess) || excess <= Epsilon) continue;

            decimal cut = Math.Min(alloc.Amount, excess);
            alloc.Amount -= cut;
            alloc.PaymentReceipt.TotalAmount -= cut;
            byFlow[flow] = excess - cut;

            if (alloc.Amount <= Epsilon)
                context.PaymentReceiptAllocations.Remove(alloc);
        }

        // Drop receipts left with no allocations (their total is now zero).
        foreach (PaymentReceipt receipt in allocations
                     .Select(a => a.PaymentReceipt!)
                     .Distinct()
                     .Where(r => r.TotalAmount <= Epsilon))
            context.PaymentReceipts.Remove(receipt);
    }
}
