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

    public static async Task TrimAsync(
        IAppDbContext context,
        Guid orderId,
        IReadOnlyDictionary<PaymentReceiptFlow, decimal> excessByFlow,
        CancellationToken ct)
    {
        List<PaymentReceiptFlow> flows = excessByFlow
            .Where(kv => kv.Value > Epsilon)
            .Select(kv => kv.Key)
            .ToList();
        if (flows.Count == 0) return;

        // One query for every flow being trimmed on this order.
        List<PaymentReceiptAllocation> allocations = await context.PaymentReceiptAllocations
            .Include(a => a.PaymentReceipt)
            .Where(a => a.OrderId == orderId && flows.Contains(a.PaymentReceipt!.Flow))
            .OrderByDescending(a => a.PaymentReceipt!.PaidAt)
            .ToListAsync(ct);

        Dictionary<PaymentReceiptFlow, decimal> remaining = flows.ToDictionary(f => f, f => excessByFlow[f]);

        foreach (PaymentReceiptAllocation alloc in allocations)
        {
            PaymentReceiptFlow flow = alloc.PaymentReceipt!.Flow;
            decimal excess = remaining[flow];
            if (excess <= Epsilon) continue;

            decimal cut = Math.Min(alloc.Amount, excess);
            alloc.Amount -= cut;
            alloc.PaymentReceipt.TotalAmount -= cut;
            remaining[flow] = excess - cut;

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
