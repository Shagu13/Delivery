using Application.Common.Interfaces;
using Application.Payments.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Payments.Queries;

public sealed record GetAdminPaymentsQuery(
    DateTime? SettlementMonthStart = null
) : IRequest<AdminPaymentsPageDto>;

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

        // ── 2. Unpaid sender groups (no request submitted yet) ────────────────
        // Include standalone Return orders (CustomerId on Order) alongside group orders (via GroupOrder).
        var unpaidOrders = await _context.Orders
            .Include(o => o.GroupOrder).ThenInclude(g => g!.Customer)
            .Include(o => o.Customer)
            .Where(o => o.WhoPaysForCompanyService    == ServicePayer.Sender
                     && o.CompanyServicePaymentStatus == CompanyServicePaymentStatus.Unpaid
                     && (o.GroupOrder!.CustomerId != null || o.CustomerId != null))
            .ToListAsync(cancellationToken);

        var unpaidGroups = unpaidOrders
            .GroupBy(o => o.GroupOrder?.CustomerId ?? o.CustomerId!.Value)
            .Select(g =>
            {
                var first    = g.First();
                var customer = first.GroupOrder?.Customer ?? first.Customer!;
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
            .Include(o => o.GroupOrder).ThenInclude(g => g!.Customer)
            .Where(o => o.AmountToCollectForPackage > 0
                     && !o.HasCompanyPaidTheSender
                     && o.Status                == OrderStatus.DeliveredToRecipient
                     && o.GroupOrder!.CustomerId != null)
            .ToListAsync(cancellationToken);

        var allOffsetEligible = await _context.Orders
            .Include(o => o.GroupOrder).ThenInclude(g => g!.Customer)
            .Where(o => o.WhoPaysForCompanyService    == ServicePayer.Sender
                     && o.CompanyServicePaymentStatus != CompanyServicePaymentStatus.Paid
                     && o.Status                      == OrderStatus.DeliveredToRecipient
                     && o.GroupOrder!.CustomerId       != null)
            .ToListAsync(cancellationToken);

        var codByCustomer  = codOrders.GroupBy(o => o.GroupOrder!.CustomerId!.Value).ToDictionary(g => g.Key);
        var feeByCustomer  = allOffsetEligible.GroupBy(o => o.GroupOrder!.CustomerId!.Value).ToDictionary(g => g.Key);
        var allCustomerIds = codByCustomer.Keys.ToHashSet();

        var payToSenders = allCustomerIds.Select(customerId =>
        {
            var codGroup = codByCustomer[customerId];
            var customer = codGroup.First().GroupOrder!.Customer!;
            var codList  = codGroup.ToList();

            var feeOrders    = feeByCustomer.TryGetValue(customerId, out var fg) ? fg.ToList() : new();
            var totalCod     = codList.Sum(o => o.AmountToCollectForPackage ?? 0m);
            var totalFees    = feeOrders.Sum(o => o.CompanyServicePrice);
            var suggestedNet = Math.Max(0m, totalCod - totalFees);

            return new AdminCodOwedToSenderDto(
                CustomerId:              customer.Id,
                CustomerBusinessName:    customer.BusinessName,
                CustomerPhone:           customer.PhoneNumber,
                TotalCodOwed:            totalCod,
                TotalServiceFeesOwed:    totalFees,
                SuggestedNetTransfer:    suggestedNet,
                CodOrders:               codList.Select(MapOrderItem).ToList(),
                OffsetEligibleFeeOrders: feeOrders.Select(MapOrderItem).ToList()
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
            TotalCompanyServiceRevenue:    d.TotalCompanyServiceRevenue,
            TotalCourierSalary:            d.TotalCourierSalary,
            TotalCourierTransferToCompany: d.TotalCourierTransferToCompany,
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

    private static PaymentOrderItem MapOrderItem(Domain.Order o) => new(
        OrderId:                    o.Id.ToString(),
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
