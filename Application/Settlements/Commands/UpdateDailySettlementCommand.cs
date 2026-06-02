using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Commands;

/// <summary>
/// Updates an existing DailySettlement for a courier on a given date,
/// recomputing all financial totals from the current set of delivered orders.
///
/// Use case: admin already saved a settlement but later assigned/delivered
/// more orders for the same day and needs to recalculate.
///
/// Rules:
/// - Settlement must already exist for this courier + date.
/// - If IsTheDayClosed == true the settlement is locked and cannot be updated.
/// - All delivered orders for the day are re-summed; partial updates are not supported.
/// - If a pending (unconfirmed) CourierHandsOverRevenue PaymentRequest exists
///   for this settlement it is updated to reflect the new transfer amount.
/// - Confirmed PaymentRequests are never modified.
/// </summary>
public sealed record UpdateDailySettlementCommand(
    Guid     CourierId,
    DateOnly Date
) : IRequest<Guid>;

public sealed class UpdateDailySettlementCommandHandler
    : IRequestHandler<UpdateDailySettlementCommand, Guid>
{
    private readonly IAppDbContext _context;
    public UpdateDailySettlementCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(
        UpdateDailySettlementCommand request,
        CancellationToken cancellationToken)
    {
        var dayStart = request.Date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var dayEnd   = request.Date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        // ── 1. Find existing settlement ───────────────────────────────────────
        var settlement = await _context.DailySettlements
            .Include(d => d.PaymentRequests)
            .FirstOrDefaultAsync(d => d.CourierId  == request.CourierId
                                   && d.CreatedAt >= dayStart
                                   && d.CreatedAt <= dayEnd,
                                 cancellationToken)
            ?? throw new NotFoundException(
                "DailySettlement",
                $"courier {request.CourierId} on {request.Date:yyyy-MM-dd}");

        // ── 2. Locked settlements cannot be changed ───────────────────────────
        if (settlement.IsTheDayClosed)
            throw new ConflictException(
                $"Settlement for {request.Date:yyyy-MM-dd} is closed and cannot be updated.");

        // ── 3. Re-load all delivered orders for the day ───────────────────────
        var orders = await _context.Orders
            .Where(o => o.CourierId == request.CourierId
                     && ((o.Status == OrderStatus.DeliveredToRecipient
                          && o.DeliveredAt >= dayStart
                          && o.DeliveredAt <= dayEnd)
                       || (o.Status == OrderStatus.DeliveredReturnOrderToWarehouse
                          && o.DeliveredToWarehouseAt >= dayStart
                          && o.DeliveredToWarehouseAt <= dayEnd)))
            .ToListAsync(cancellationToken);

        // ── 4. All orders must have full financial data ───────────────────────
        var incomplete = orders
            .Where(o => o.CourierSalary     == null || o.CourierSalary     <= 0m
                     || o.CompanyServicePrice <= 0m
                     || o.CompanyRevenue      == null)
            .Select(o => o.TrackingNumber)
            .ToList();

        if (incomplete.Count > 0)
            throw new ConflictException(
                $"Cannot update settlement: the following orders are missing financial data — " +
                string.Join(", ", incomplete));

        // ── 5. Recompute immutable physical totals ────────────────────────────
        var prevSalary   = settlement.TotalCourierSalary;
        var prevTransfer = settlement.TotalCourierTransferToCompany;

        var totalCashCollected     = orders.Sum(o => o.AmountOfCashCollected ?? 0m);
        var totalServiceRevenue    = orders.Sum(o => o.CompanyServicePrice);
        var totalCourierSalary     = orders.Sum(o => o.CourierSalary ?? 0m);
        var totalTransferToCompany = totalCashCollected - totalCourierSalary;
        var totalNetIncome         = totalServiceRevenue - totalCourierSalary;

        var totalOrdersPickedUp = await _context.GroupOrders
            .Where(g => g.CourierId  == request.CourierId
                     && g.PickedUpAt >= dayStart
                     && g.PickedUpAt <= dayEnd)
            .SumAsync(g => (int?)g.NumberOfPackages, cancellationToken) ?? 0;

        // ── 6. Patch settlement record ────────────────────────────────────────
        settlement.TotalOrdersPickedUp           = totalOrdersPickedUp;
        settlement.TotalOrdersDelivered          = orders.Count;
        settlement.TotalAmountOfCashCollected    = totalCashCollected > 0 ? totalCashCollected : null;
        settlement.TotalCompanyServiceRevenue    = totalServiceRevenue;
        settlement.TotalCourierSalary            = totalCourierSalary;
        settlement.TotalCourierTransferToCompany = totalTransferToCompany;
        settlement.TotalCompanyNetIncome         = totalNetIncome;

        // ── 7. Auto-reset payment flags when amounts change ──────────────────
        // If the salary or transfer amount changed, the previously recorded
        // payment is no longer accurate — reset the flag and remove the record.
        if (totalCourierSalary != prevSalary && settlement.WasCourierPaid)
        {
            settlement.WasCourierPaid = false;
            settlement.CourierPaidAt  = null;
            var pr = settlement.PaymentRequests
                .FirstOrDefault(p => p.Type == PaymentRequestType.CompanyPaysCourier);
            if (pr is not null) _context.PaymentRequests.Remove(pr);
        }

        if (totalTransferToCompany != prevTransfer && settlement.HasCourierHandedOverRevenue)
        {
            settlement.HasCourierHandedOverRevenue = false;
            settlement.RevenueHandedOverAt         = null;
            var pr = settlement.PaymentRequests
                .FirstOrDefault(p => p.Type == PaymentRequestType.CourierHandsOverRevenue);
            if (pr is not null) _context.PaymentRequests.Remove(pr);
        }

        // ── 9. Update pending (unconfirmed) PaymentRequests ──────────────────
        foreach (var pr in settlement.PaymentRequests
            .Where(p => p.Status != PaymentRequestStatus.Confirmed))
        {
            if (pr.Type == PaymentRequestType.CourierHandsOverRevenue)
                pr.TotalAmount = totalTransferToCompany;
            else if (pr.Type == PaymentRequestType.CompanyPaysCourier)
                pr.TotalAmount = totalCourierSalary;
        }

        // ── 10. Auto-mark payment events (re-mark anything reset above) ───────
        if (totalTransferToCompany > 0 && !settlement.HasCourierHandedOverRevenue)
        {
            settlement.HasCourierHandedOverRevenue = true;
            settlement.RevenueHandedOverAt         = DateTime.UtcNow;
            settlement.WasCourierPaid              = true;
            settlement.CourierPaidAt               = DateTime.UtcNow;
            _context.PaymentRequests.Add(new PaymentRequest
            {
                Type              = PaymentRequestType.CourierHandsOverRevenue,
                Status            = PaymentRequestStatus.Confirmed,
                CourierId         = settlement.CourierId,
                DailySettlementId = settlement.Id,
                TotalAmount       = totalTransferToCompany,
                AmountConfirmed   = totalTransferToCompany,
                ConfirmedAt       = DateTime.UtcNow,
            });
        }
        else if (totalCourierSalary > 0 && !settlement.WasCourierPaid)
        {
            var owedToCourier = totalCourierSalary - totalCashCollected;
            settlement.WasCourierPaid = true;
            settlement.CourierPaidAt  = DateTime.UtcNow;
            _context.PaymentRequests.Add(new PaymentRequest
            {
                Type              = PaymentRequestType.CompanyPaysCourier,
                Status            = PaymentRequestStatus.Confirmed,
                CourierId         = settlement.CourierId,
                DailySettlementId = settlement.Id,
                TotalAmount       = owedToCourier,
                AmountConfirmed   = owedToCourier,
                ConfirmedAt       = DateTime.UtcNow,
            });
        }

        await _context.SaveChangesAsync(cancellationToken);
        return settlement.Id;
    }
}
