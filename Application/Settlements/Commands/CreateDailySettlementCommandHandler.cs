using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Commands;

public sealed class CreateDailySettlementCommandHandler
    : IRequestHandler<CreateDailySettlementCommand, Guid>
{
    private readonly IAppDbContext _context;
    public CreateDailySettlementCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(
        CreateDailySettlementCommand request,
        CancellationToken cancellationToken)
    {
        // ── 1. Courier must exist ─────────────────────────────────────────────
        var courierExists = await _context.Couriers
            .AnyAsync(c => c.Id == request.CourierId, cancellationToken);

        if (!courierExists)
            throw new NotFoundException("Courier", request.CourierId);

        // ── 2. No duplicate settlement for same courier + day ─────────────────
        var dayStart = request.Date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var dayEnd   = request.Date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        var alreadyExists = await _context.DailySettlements
            .AnyAsync(d => d.CourierId  == request.CourierId
                        && d.CreatedAt >= dayStart
                        && d.CreatedAt <= dayEnd,
                      cancellationToken);

        if (alreadyExists)
            throw new ConflictException(
                $"A settlement for courier {request.CourierId} on {request.Date:yyyy-MM-dd} already exists.");

        // ── 3. Load all delivered orders for the day ──────────────────────────
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
            .Where(o => o.CourierSalary      == null || o.CourierSalary      <= 0m
                     || o.CompanyServicePrice  <= 0m
                     || o.CompanyRevenue       == null)
            .Select(o => o.TrackingNumber)
            .ToList();

        if (incomplete.Count > 0)
            throw new ConflictException(
                $"Cannot create settlement: the following orders are missing financial data — " +
                string.Join(", ", incomplete));

        // ── 5. Compute immutable physical totals ──────────────────────────────

        // Total cash the courier physically collected from recipients.
        // For Recipient-payer orders: AmountOfCashCollected already includes
        // the package COD + the service fee bundled together.
        // For Sender-payer orders: AmountOfCashCollected is only the package COD.
        var totalCashCollected    = orders.Sum(o => o.AmountOfCashCollected ?? 0m);
        var totalServiceRevenue   = orders.Sum(o => o.CompanyServicePrice);
        var totalCourierSalary    = orders.Sum(o => o.CourierSalary ?? 0m);
        var totalTransferToCompany = totalCashCollected - totalCourierSalary;
        var totalNetIncome        = totalServiceRevenue - totalCourierSalary;

        // ── 6. Count packages picked up on this day ───────────────────────────
        var totalOrdersPickedUp = await _context.GroupOrders
            .Where(g => g.CourierId  == request.CourierId
                     && g.PickedUpAt >= dayStart
                     && g.PickedUpAt <= dayEnd)
            .SumAsync(g => (int?)g.NumberOfPackages, cancellationToken) ?? 0;

        // ── 7. Create settlement ──────────────────────────────────────────────
        var settlement = new DailySettlement
        {
            CourierId                     = request.CourierId,
            TotalOrdersPickedUp           = totalOrdersPickedUp,
            TotalOrdersDelivered          = orders.Count,
            TotalAmountOfCashCollected    = totalCashCollected > 0 ? totalCashCollected : null,
            TotalCompanyServiceRevenue    = totalServiceRevenue,
            TotalCourierSalary            = totalCourierSalary,
            TotalCourierTransferToCompany = totalTransferToCompany,
            TotalCompanyNetIncome         = totalNetIncome,
            CreatedAt                     = dayStart,
            IsTheDayClosed                = false,
        };

        _context.DailySettlements.Add(settlement);
        await _context.SaveChangesAsync(cancellationToken);

        return settlement.Id;
    }
}
