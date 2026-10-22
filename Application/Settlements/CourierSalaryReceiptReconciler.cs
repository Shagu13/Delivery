using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements;

/// <summary>
/// Keeps the stored courier-salary payment history consistent after an admin changes an
/// order's <see cref="Order.CourierSalary"/>. When the new salary is below what was already
/// paid, the order's paid amount is capped at the new salary and the surplus is trimmed off
/// that order's <see cref="PaymentReceiptAllocation"/>s (newest receipt first); receipt totals
/// are adjusted and emptied receipts removed. Raising the salary needs no change — the extra
/// simply becomes outstanding (derived live by OrderFinance).
/// </summary>
public static class CourierSalaryReceiptReconciler
{
    private const decimal Epsilon = 0.005m;

    /// <summary>Call after assigning the new salary on a tracked order; the caller saves.</summary>
    public static async Task ReconcileAsync(
        IAppDbContext context, Order order, decimal? newSalary, CancellationToken ct)
    {
        decimal paid = order.CourierSalaryPaidAmount ?? 0m;
        decimal cap  = newSalary ?? 0m;
        decimal excess = paid - cap;
        if (excess <= Epsilon) return;

        order.CourierSalaryPaidAmount = cap > Epsilon ? cap : null;
        if (order.CourierSalaryPaidAmount is null) order.CourierSalaryPaidAt = null;

        await PaymentReceiptTrimmer.TrimAsync(
            context, order.Id,
            new Dictionary<PaymentReceiptFlow, decimal> { [PaymentReceiptFlow.CourierSalary] = excess },
            ct);
    }
}
