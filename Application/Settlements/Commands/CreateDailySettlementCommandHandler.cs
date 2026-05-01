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

        // ── 3. All delivered orders for the day must have full financial data ──
        var incomplete = await _context.Orders
            .Where(o => o.CourierId   == request.CourierId
                     && o.Status      == OrderStatus.DeliveredToRecipient
                     && o.DeliveredAt >= dayStart
                     && o.DeliveredAt <= dayEnd
                     && (o.CourierSalary      == null || o.CourierSalary      <= 0m
                      || o.CompanyServicePrice  <= 0m
                      || o.CompanyRevenue       == null))
            .Select(o => o.TrackingNumber)
            .ToListAsync(cancellationToken);

        if (incomplete.Count > 0)
            throw new ConflictException(
                $"Cannot create settlement: the following orders are missing financial data — " +
                string.Join(", ", incomplete));

        // ── 4. Create settlement ──────────────────────────────────────────────
        var settlement = new DailySettlement
        {
            CourierId                  = request.CourierId,
            TotalOrdersPickedUp        = request.TotalOrdersPickedUp,
            TotalOrdersDelivered       = request.TotalOrdersDelivered,
            TotalAmountOfCashCollected = request.TotalAmountOfCashCollected,
            TotalCompanyServiceRevenue = request.TotalCompanyServiceRevenue,
            TotalCourierSalary         = request.TotalCourierSalary,
            TotalCompanyNetIncome      = request.TotalCompanyNetIncome,
            CreatedAt                  = dayStart,   // anchor CreatedAt to start-of-day UTC
            IsTheDayClosed             = false,
        };

        _context.DailySettlements.Add(settlement);
        await _context.SaveChangesAsync(cancellationToken);

        return settlement.Id;
    }
}
