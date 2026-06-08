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

        // ── Check if a settlement already exists for this day ──────────────────
        var existingSettlement = await _context.CourierSettlements
            .AsNoTracking()
            .Where(d => d.CourierId  == request.CourierId
                     && d.CreatedAt >= dayStart
                     && d.CreatedAt <= dayEnd)
            .Select(d => new { d.Id, d.AmountCourierWasPaid })
            .FirstOrDefaultAsync(cancellationToken);

        // ── Delivered orders for the day ──────────────────────────────────────
        // Keyed on the courier's physical delivery event so an order stays counted
        // for the day it was delivered even after the admin advances it to its final
        // terminal status: Send/Exchange → ExchangeCompleted (still dated by DeliveredAt),
        // Return → ReturnedToSender (still dated by DeliveredToWarehouseAt).
        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == request.CourierId
                     && (((o.Status == OrderStatus.DeliveredToRecipient
                           || o.Status == OrderStatus.ExchangeCompleted)
                          && o.DeliveredAt >= dayStart
                          && o.DeliveredAt <= dayEnd)
                       || ((o.Status == OrderStatus.DeliveredReturnOrderToWarehouse
                            || o.Status == OrderStatus.ReturnedToSender)
                          && o.DeliveredToWarehouseAt >= dayStart
                          && o.DeliveredToWarehouseAt <= dayEnd)))
            .OrderBy(o => o.DeliveredAt ?? o.DeliveredToWarehouseAt)
            .ToListAsync(cancellationToken);

        // ── GroupOrders picked up on the day → drives TotalOrdersPickedUp ────
        var pickedUpPackages = await _context.GroupOrders
            .AsNoTracking()
            .Where(g => g.CourierId  == request.CourierId
                     && g.PickedUpAt >= dayStart
                     && g.PickedUpAt <= dayEnd)
            .SumAsync(g => (int?)g.NumberOfPackages, cancellationToken) ?? 0;

        // ── Financial totals ──────────────────────────────────────────────────
        // totalCash = AmountOfCashCollected already includes both the package COD
        // AND the service fee for Recipient-payer orders. Do NOT add service fees again.
        var totalCash        = orders.Sum(o => o.AmountOfCashCollected ?? 0m);

        // Pure parcel money only (no service fees) — used for the COD display row.
        var totalCodOnly     = orders.Sum(o => o.AmountToCollectForPackage ?? 0m);

        var totalService     = orders.Sum(o => o.CompanyServicePrice);
        var totalSalary      = orders.Sum(o => o.CourierSalary ?? 0m);
        var totalNetIncome   = totalService - totalSalary;

        // Service fees collected in cash from recipients (already inside totalCash above).
        // Used for display only — shows the breakdown of what is inside totalCash.
        var totalServiceFeesFromRecipients = orders
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Recipient)
            .Sum(o => o.CompanyServicePrice);

        // Courier holds exactly what they collected. No double-counting.
        // totalCash = package COD + service fees from recipients (bundled by courier at delivery)
        var totalCashCourierHolds    = totalCash;
        var totalTransferToCompany   = totalCash - totalSalary;

        // ── Flag orders missing required financial data ────────────────────────
        var incomplete = orders
            .Where(o => o.CourierSalary == null || o.CourierSalary <= 0m
                     || o.CompanyServicePrice  <= 0m
                     || o.CompanyRevenue       == null)
            .Select(o => o.TrackingNumber)
            .ToList();

        var lines = orders.Select(o => new SettlementOrderLineDto(
            Id:                    o.Id,
            TrackingNumber:        o.TrackingNumber,
            RecipientName:         $"{o.RecipientFirstName} {o.RecipientLastName}",
            RecipientCity:         o.RecipientCity,
            RecipientDistrict:     o.RecipientDistrict,
            CompanyServicePrice:   o.CompanyServicePrice,
            WhoPaysForCompanyService: o.WhoPaysForCompanyService.ToString(),
            CourierSalary:         o.CourierSalary,
            CompanyRevenue:        o.CompanyRevenue,
            AmountOfCashCollected: o.AmountOfCashCollected,
            DeliveredAt:           o.DeliveredAt ?? o.DeliveredToWarehouseAt
        )).ToList();

        return new SettlementPreviewDto(
            CourierId:                              courier.Id,
            CourierFullName:                        $"{courier.FirstName} {courier.LastName}",
            Date:                                   request.Date,
            ExistingSettlementId:                   existingSettlement?.Id,
            ExistingAmountCourierWasPaid:           existingSettlement?.AmountCourierWasPaid,
            TotalOrdersPickedUp:                    pickedUpPackages,
            TotalOrdersDelivered:                   orders.Count,
            TotalAmountOfCashCollected:             totalCash,
            TotalCodOnlyAmount:                     totalCodOnly,
            TotalCompanyServiceRevenue:             totalService,
            TotalServiceFeesCollectedFromRecipients: totalServiceFeesFromRecipients,
            TotalCashCourierHolds:                  totalCashCourierHolds,
            TotalCourierSalary:                     totalSalary,
            TotalCompanyNetIncome:                  totalNetIncome,
            TotalCourierTransferToCompany:          totalTransferToCompany,
            Orders:                                 lines,
            IncompleteOrderTrackingNumbers:         incomplete
        );
    }
}
