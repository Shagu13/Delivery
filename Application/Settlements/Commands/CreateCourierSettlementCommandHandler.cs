using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Commands;

public sealed class CreateCourierSettlementCommandHandler
    : IRequestHandler<CreateCourierSettlementCommand, Guid>
{
    private readonly IAppDbContext _context;
    public CreateCourierSettlementCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(
        CreateCourierSettlementCommand request,
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

        var alreadyExists = await _context.CourierSettlements
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
        // Service fees the recipient paid in cash (already inside totalCashCollected).
        var totalServiceCollectedByRecipient = orders
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Recipient)
            .Sum(o => o.CompanyServicePrice);
        var totalCourierSalary    = orders.Sum(o => o.CourierSalary ?? 0m);
        var totalTransferToCompany = totalCashCollected - totalCourierSalary;
        var totalNetIncome        = totalServiceRevenue - totalCourierSalary;

        // ── 6. Count packages picked up on this day ───────────────────────────
        var totalOrdersPickedUp = await _context.GroupOrders
            .Where(g => g.CourierId  == request.CourierId
                     && g.PickedUpAt >= dayStart
                     && g.PickedUpAt <= dayEnd)
            .SumAsync(g => (int?)g.NumberOfPackages, cancellationToken) ?? 0;

        // ── 6b. Cancelled / postponed counts for the day ──────────────────────
        // Cancelled: no CancelledAt timestamp exists, so the day is attributed
        // via Order.CreatedAt. Postponed: counted via PostponedAt regardless of
        // the order's current status (a postponed order may later be delivered).
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

        // ── 6c. Amount the courier was paid ───────────────────────────────────
        var amountCourierWasPaid = request.PayCourierFully
            ? totalCourierSalary
            : (request.PartialAmountPaid ?? 0m);

        // ── 7. Create settlement ──────────────────────────────────────────────
        var settlement = new CourierSettlement
        {
            CourierId                     = request.CourierId,
            TotalOrdersPickedUp           = totalOrdersPickedUp,
            TotalOrdersDelivered          = orders.Count,
            NumberOfOrdersCancelled       = numberOfOrdersCancelled,
            NumberOfOrderPostponed        = numberOfOrderPostponed,
            TotalAmountOfCashCollected    = totalCashCollected > 0 ? totalCashCollected : null,
            TotalCompanyServiceRevenue    = totalServiceRevenue,
            TotalCompanyServicePriceCollectedByRecipient = totalServiceCollectedByRecipient,
            TotalCourierSalary            = totalCourierSalary,
            AmountCourierWasPaid          = amountCourierWasPaid,
            TotalCourierTransferToCompany = totalTransferToCompany,
            TotalCompanyNetIncome         = totalNetIncome,
            CreatedAt                     = dayStart,
            IsTheDayClosed                = false,
        };

        _context.CourierSettlements.Add(settlement);

        await _context.SaveChangesAsync(cancellationToken);

        return settlement.Id;
    }
}
