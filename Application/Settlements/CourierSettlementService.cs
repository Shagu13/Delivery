using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements;

/// <summary>
/// Shared recompute for an existing courier daily settlement, so figures stay in
/// lock-step with the underlying orders when an admin edits financials after the
/// settlement was created. Mirrors the money math in
/// <see cref="Commands.CreateCourierSettlementCommandHandler"/>.
/// </summary>
internal static class CourierSettlementService
{
    /// <summary>
    /// Recomputes the financial totals of the courier's settlement for the day that
    /// contains <paramref name="deliveredAtUtc"/>. No-op when no settlement exists yet
    /// for that courier+day (it will be computed fresh when one is created).
    /// Counts and IsTheDayClosed are preserved; AmountCourierWasPaid shifts by the
    /// same delta as the salary total (so a fully-paid day stays fully paid and any
    /// partial-payment gap is kept) — only order-derived money figures are refreshed.
    /// </summary>
    public static async Task RecomputeForDayAsync(
        IAppDbContext context,
        Guid courierId,
        DateTime deliveredAtUtc,
        CancellationToken ct)
    {
        var day      = DateOnly.FromDateTime(deliveredAtUtc);
        var dayStart = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var dayEnd   = day.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        var settlement = await context.CourierSettlements
            .FirstOrDefaultAsync(s => s.CourierId  == courierId
                                   && s.CreatedAt >= dayStart
                                   && s.CreatedAt <= dayEnd, ct);

        // Nothing settled yet for this day → the create flow will pick up the new
        // figures when the settlement is eventually created.
        if (settlement is null) return;

        var orders = await context.Orders
            .Where(o => o.CourierId == courierId
                     && (((o.Status == OrderStatus.DeliveredToRecipient
                           || o.Status == OrderStatus.ExchangeCompleted)
                          && o.DeliveredAt >= dayStart
                          && o.DeliveredAt <= dayEnd)
                       || ((o.Status == OrderStatus.DeliveredReturnOrderToWarehouse
                            || o.Status == OrderStatus.ReturnedToSender)
                          && o.DeliveredToWarehouseAt >= dayStart
                          && o.DeliveredToWarehouseAt <= dayEnd)))
            .ToListAsync(ct);

        var totalCashCollected  = orders.Sum(o => o.AmountOfCashCollected ?? 0m);
        var totalServiceRevenue = orders.Sum(o => o.CompanyServicePrice);
        var totalServiceCollectedFromRecipient = orders
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Recipient)
            .Sum(o => o.CompanyServicePrice);
        var totalCourierSalary  = orders.Sum(o => o.CourierSalary ?? 0m);

        // Shift the amount actually paid to the courier by the same delta as the
        // salary total, clamped at zero. Fully-paid days stay fully paid; a partial
        // gap (owed = salary − paid) is preserved across the edit.
        var salaryDelta = totalCourierSalary - settlement.TotalCourierSalary;
        var newAmountPaid = settlement.AmountCourierWasPaid + salaryDelta;
        settlement.AmountCourierWasPaid = newAmountPaid > 0 ? newAmountPaid : 0m;

        settlement.TotalAmountOfCashCollected    = totalCashCollected > 0 ? totalCashCollected : null;
        settlement.TotalCompanyServiceRevenue    = totalServiceRevenue;
        settlement.TotalCompanyServicePriceCollectedFromRecipient = totalServiceCollectedFromRecipient;
        settlement.TotalCourierSalary            = totalCourierSalary;
        settlement.TotalCourierTransferToCompany = totalCashCollected - totalCourierSalary;
        settlement.TotalCompanyNetIncome         = totalServiceRevenue - totalCourierSalary;
        settlement.UpdatedAt                     = DateTime.UtcNow;

        await context.SaveChangesAsync(ct);
    }
}
