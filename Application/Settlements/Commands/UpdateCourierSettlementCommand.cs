using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Commands;

/// <summary>
/// Updates an existing CourierSettlement for a courier on a given date,
/// recomputing all financial totals from the current set of delivered orders.
///
/// Use case: admin already saved a settlement but later assigned/delivered
/// more orders for the same day and needs to recalculate.
///
/// Rules:
/// - Settlement must already exist for this courier + date.
/// - If IsTheDayClosed == true the settlement is locked and cannot be updated.
/// - All delivered orders for the day are re-summed; partial updates are not supported.
/// </summary>
public sealed record UpdateCourierSettlementCommand(
    Guid     CourierId,
    DateOnly Date,
    bool     PayCourierFully  = false,
    decimal? PartialAmountPaid = null
) : IRequest<Guid>;

public sealed class UpdateCourierSettlementCommandHandler
    : IRequestHandler<UpdateCourierSettlementCommand, Guid>
{
    private readonly IAppDbContext _context;
    public UpdateCourierSettlementCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(
        UpdateCourierSettlementCommand request,
        CancellationToken cancellationToken)
    {
        var dayStart = request.Date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var dayEnd   = request.Date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        // ── 1. Find existing settlement ───────────────────────────────────────
        var settlement = await _context.CourierSettlements
            .FirstOrDefaultAsync(d => d.CourierId  == request.CourierId
                                   && d.CreatedAt >= dayStart
                                   && d.CreatedAt <= dayEnd,
                                 cancellationToken)
            ?? throw new NotFoundException(
                "CourierSettlement",
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
        var totalCashCollected     = orders.Sum(o => o.AmountOfCashCollected ?? 0m);
        var totalServiceRevenue    = orders.Sum(o => o.CompanyServicePrice);
        var totalServiceCollectedFromRecipient = orders
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Recipient)
            .Sum(o => o.CompanyServicePrice);
        var totalCourierSalary     = orders.Sum(o => o.CourierSalary ?? 0m);
        var totalTransferToCompany = totalCashCollected - totalCourierSalary;
        var totalNetIncome         = totalServiceRevenue - totalCourierSalary;

        var totalOrdersPickedUp = await _context.GroupOrders
            .Where(g => g.CourierId  == request.CourierId
                     && g.PickedUpAt >= dayStart
                     && g.PickedUpAt <= dayEnd)
            .SumAsync(g => (int?)g.NumberOfPackages, cancellationToken) ?? 0;

        // Cancelled (by Order.CreatedAt — no CancelledAt exists) and postponed
        // (by Order.PostponedAt) counts for the day.
        var numberOfOrdersCancelled = await _context.Orders
            .CountAsync(o => o.CourierId == request.CourierId
                          && o.Status == OrderStatus.CancelledByAdmin
                          && o.CreatedAt >= dayStart
                          && o.CreatedAt <= dayEnd,
                        cancellationToken);

        var numberOfOrderPostponed = await _context.Orders
            .CountAsync(o => o.CourierId == request.CourierId
                          && o.PostponedAt != null
                          && o.PostponedAt >= dayStart
                          && o.PostponedAt <= dayEnd,
                        cancellationToken);

        var amountCourierWasPaid = request.PayCourierFully
            ? totalCourierSalary
            : (request.PartialAmountPaid ?? 0m);

        // ── 6. Patch settlement record ────────────────────────────────────────
        settlement.TotalOrdersPickedUp           = totalOrdersPickedUp;
        settlement.TotalOrdersDelivered          = orders.Count;
        settlement.NumberOfOrdersCancelled       = numberOfOrdersCancelled;
        settlement.NumberOfOrderPostponed        = numberOfOrderPostponed;
        settlement.TotalAmountOfCashCollected    = totalCashCollected > 0 ? totalCashCollected : null;
        settlement.TotalCompanyServiceRevenue    = totalServiceRevenue;
        settlement.TotalCompanyServicePriceCollectedFromRecipient = totalServiceCollectedFromRecipient;
        settlement.TotalCourierSalary            = totalCourierSalary;
        settlement.AmountCourierWasPaid          = amountCourierWasPaid;
        settlement.TotalCourierTransferToCompany = totalTransferToCompany;
        settlement.TotalCompanyNetIncome         = totalNetIncome;
        settlement.UpdatedAt                     = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        return settlement.Id;
    }
}
