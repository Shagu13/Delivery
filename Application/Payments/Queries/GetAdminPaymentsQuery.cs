using Application.Common.Interfaces;
using Application.Payments.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Payments.Queries;

// ── Query ─────────────────────────────────────────────────────────────────────

/// <summary>
/// Returns all data for the admin Payments page:
///   1. Collect from Senders   (SenderPaysCompany pending requests + unpaid groups)
///   2. Pay to Senders COD     (orders where company owes sender product money)
///   3. Courier Settlements    (DailySettlement list with payment flags)
/// </summary>
/// <param name="SettlementMonthStart">Optional: filter settlements by month. Null = last 60 days.</param>
public sealed record GetAdminPaymentsQuery(
    DateTime? SettlementMonthStart = null
) : IRequest<AdminPaymentsPageDto>;

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class GetAdminPaymentsQueryHandler
    : IRequestHandler<GetAdminPaymentsQuery, AdminPaymentsPageDto>
{
    private readonly IAppDbContext _context;
    public GetAdminPaymentsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<AdminPaymentsPageDto> Handle(
        GetAdminPaymentsQuery request,
        CancellationToken cancellationToken)
    {
        // ── 1. Pending SenderPaysCompany requests ─────────────────────────────
        var pendingRequests = await _context.PaymentRequests
            .Include(p => p.Customer)
            .Include(p => p.Orders)
            .Where(p => p.Type   == PaymentRequestType.SenderPaysCompany
                     && p.Status != PaymentRequestStatus.Confirmed)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync(cancellationToken);

        var pendingDtos = pendingRequests.Select(p => new AdminSenderPaymentRequestDto(
            PaymentRequestId:      p.Id,
            CustomerId:            p.CustomerId ?? Guid.Empty,
            CustomerBusinessName:  p.Customer?.BusinessName ?? "—",
            CustomerPhone:         p.Customer?.PhoneNumber  ?? "—",
            TotalAmount:           p.TotalAmount,
            AmountConfirmed:       p.AmountConfirmed,
            Status:                p.Status.ToString(),
            Note:                  p.Note,
            CreatedAt:             p.CreatedAt,
            ConfirmedAt:           p.ConfirmedAt,
            Orders:                p.Orders.Select(MapOrderItem).ToList()
        )).ToList();

        // ── 2. Unpaid sender groups (no request submitted yet) ─────────────────
        var unpaidOrders = await _context.Orders
            .Include(o => o.GroupOrder).ThenInclude(g => g.Customer)
            .Where(o => o.WhoPaysForCompanyService    == ServicePayer.Sender
                     && o.CompanyServicePaymentStatus == CompanyServicePaymentStatus.Unpaid
                     && o.GroupOrder.CustomerId       != null)
            .ToListAsync(cancellationToken);

        var unpaidGroups = unpaidOrders
            .GroupBy(o => o.GroupOrder.CustomerId!.Value)
            .Select(g =>
            {
                var customer = g.First().GroupOrder.Customer!;
                return new AdminUnpaidSenderGroupDto(
                    CustomerId:           g.Key,
                    CustomerBusinessName: customer.BusinessName,
                    CustomerPhone:        customer.PhoneNumber,
                    TotalUnpaid:          g.Sum(o => o.CompanyServicePrice),
                    OrderCount:           g.Count()
                );
            })
            .OrderByDescending(g => g.TotalUnpaid)
            .ToList();

        var collectFromSenders = new AdminCollectFromSendersDto(
            PendingRequests: pendingDtos,
            UnpaidGroups:    unpaidGroups
        );

        // ── 3. COD owed to senders ────────────────────────────────────────────
        var codOrders = await _context.Orders
            .Include(o => o.GroupOrder).ThenInclude(g => g.Customer)
            .Where(o => o.AmountToCollectForPackage > 0
                     && !o.HasCompanyPaidTheSender
                     && o.Status                == OrderStatus.DeliveredToRecipient
                     && o.GroupOrder.CustomerId != null)
            .ToListAsync(cancellationToken);

        var payToSenders = codOrders
            .GroupBy(o => o.GroupOrder.CustomerId!.Value)
            .Select(g =>
            {
                var customer = g.First().GroupOrder.Customer!;
                return new AdminCodOwedToSenderDto(
                    CustomerId:           g.Key,
                    CustomerBusinessName: customer.BusinessName,
                    CustomerPhone:        customer.PhoneNumber,
                    TotalCodOwed:         g.Sum(o => o.AmountToCollectForPackage ?? 0m),
                    Orders:               g.Select(MapOrderItem).ToList()
                );
            })
            .OrderByDescending(g => g.TotalCodOwed)
            .ToList();

        // ── 4. Courier settlements ─────────────────────────────────────────────
        var settlementFrom = request.SettlementMonthStart
            ?? DateTime.UtcNow.AddDays(-60);

        var settlements = await _context.DailySettlements
            .Include(d => d.Courier)
            .Where(d => d.CreatedAt >= settlementFrom)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(cancellationToken);

        var settlementDtos = settlements.Select(d => new AdminCourierSettlementDto(
            SettlementId:                  d.Id,
            CourierId:                     d.CourierId,
            CourierFullName:               $"{d.Courier.FirstName} {d.Courier.LastName}",
            CourierPhone:                  d.Courier.PhoneNumber,
            SettlementDate:                d.CreatedAt,
            TotalOrdersDelivered:          d.TotalOrdersDelivered,
            TotalOrdersPickedUp:           d.TotalOrdersPickedUp,
            TotalAmountOfCashCollected:    d.TotalAmountOfCashCollected,
            TotalCodOwedToSenders:         d.TotalCodOwedToSenders,
            TotalCompanyServiceRevenue:    d.TotalCompanyServiceRevenue,
            TotalServiceFeesOwedBySenders: d.TotalServiceFeesOwedBySenders,
            TotalCourierSalary:            d.TotalCourierSalary,
            TotalCourierTransferToCompany: d.TotalCourierTransferToCompany,
            CompanyNetCashAfterCod:        d.CompanyNetCashAfterCod,
            TotalCompanyNetIncome:         d.TotalCompanyNetIncome,
            IsTheDayClosed:                d.IsTheDayClosed,
            WasCourierPaid:                d.WasCourierPaid,
            CourierPaidAt:                 d.CourierPaidAt,
            HasCourierHandedOverRevenue:   d.HasCourierHandedOverRevenue,
            RevenueHandedOverAt:           d.RevenueHandedOverAt
        )).ToList();

        return new AdminPaymentsPageDto(
            CollectFromSenders: collectFromSenders,
            PayToSenders:       payToSenders,
            CourierSettlements: settlementDtos
        );
    }

    private static PaymentOrderItemDto MapOrderItem(Domain.Order o) => new(
        OrderId:                    o.Id,
        TrackingNumber:             o.TrackingNumber,
        RecipientFirstName:         o.RecipientFirstName,
        RecipientCity:              o.RecipientCity,
        RecipientDistrict:          o.RecipientDistrict,
        CompanyServicePrice:        o.CompanyServicePrice,
        AmountOfCashCollected:      o.AmountOfCashCollected,
        AmountToCollectForPackage:  o.AmountToCollectForPackage,
        Status:                     o.Status.ToString(),
        CompanyServicePaymentStatus: o.CompanyServicePaymentStatus.ToString(),
        HasCompanyPaidTheSender:    o.HasCompanyPaidTheSender,
        CreatedAt:                  o.CreatedAt,
        DeliveredAt:                o.DeliveredAt
    );
}
