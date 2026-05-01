using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Queries;

public sealed class GetSettlementPreviewQueryHandler
    : IRequestHandler<GetSettlementPreviewQuery, SettlementPreviewDto>
{
    private readonly IAppDbContext _context;
    public GetSettlementPreviewQueryHandler(IAppDbContext context) => _context = context;

    public async Task<SettlementPreviewDto> Handle(
        GetSettlementPreviewQuery request,
        CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierId);

        var dayStart = request.Date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var dayEnd   = request.Date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        // ── Delivered orders for the day ──────────────────────────────────────
        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId   == request.CourierId
                     && o.Status      == OrderStatus.DeliveredToRecipient
                     && o.DeliveredAt >= dayStart
                     && o.DeliveredAt <= dayEnd)
            .OrderBy(o => o.DeliveredAt)
            .ToListAsync(cancellationToken);

        // ── GroupOrders picked up on the day → drives TotalOrdersPickedUp ────
        var pickedUpPackages = await _context.GroupOrders
            .AsNoTracking()
            .Where(g => g.CourierId  == request.CourierId
                     && g.PickedUpAt >= dayStart
                     && g.PickedUpAt <= dayEnd)
            .SumAsync(g => (int?)g.NumberOfPackages, cancellationToken) ?? 0;

        // ── Financial totals ──────────────────────────────────────────────────
        var totalCash        = orders.Sum(o => o.AmountOfCashCollected ?? 0m);
        var totalService     = orders.Sum(o => o.CompanyServicePrice);
        var totalSalary      = orders.Sum(o => o.CourierSalary ?? 0m);
        var totalNetIncome   = totalService - totalSalary;

        // ── Flag orders missing required financial data ────────────────────────
        var incomplete = orders
            .Where(o => o.CourierSalary == null || o.CourierSalary <= 0m
                     || o.CompanyServicePrice  <= 0m
                     || o.CompanyRevenue       == null)
            .Select(o => o.TrackingNumber)
            .ToList();

        var lines = orders.Select(o => new SettlementOrderLineDto(
            Id:                   o.Id,
            TrackingNumber:       o.TrackingNumber,
            RecipientName:        $"{o.RecipientFirstName} {o.RecipientLastName}",
            RecipientCity:        o.RecipientCity,
            RecipientDistrict:    o.RecipientDistrict,
            CompanyServicePrice:  o.CompanyServicePrice,
            CourierSalary:        o.CourierSalary,
            CompanyRevenue:       o.CompanyRevenue,
            AmountOfCashCollected:o.AmountOfCashCollected,
            DeliveredAt:          o.DeliveredAt
        )).ToList();

        return new SettlementPreviewDto(
            CourierId:                       courier.Id,
            CourierFullName:                 $"{courier.FirstName} {courier.LastName}",
            Date:                            request.Date,
            TotalOrdersPickedUp:             pickedUpPackages,
            TotalOrdersDelivered:            orders.Count,
            TotalAmountOfCashCollected:      totalCash,
            TotalCompanyServiceRevenue:      totalService,
            TotalCourierSalary:              totalSalary,
            TotalCompanyNetIncome:           totalNetIncome,
            Orders:                          lines,
            IncompleteOrderTrackingNumbers:  incomplete
        );
    }
}
