using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Payments.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Payments.Queries;

/// <summary>
/// Returns payment data for the authenticated customer's Payments page:
///   - Service fee orders (WhoPaysForCompanyService == Sender) for the given month
///   - Their SenderPaysCompany payment request history
///   - COD income orders
///   - COD payout history (CompanyPaysSender records) — shows netting breakdown
/// </summary>
public sealed record GetCustomerPaymentsQuery(
    string ApplicationUserId,
    int    Year,
    int    Month
) : IRequest<CustomerPaymentsPageDto>;

public sealed class GetCustomerPaymentsQueryHandler
    : IRequestHandler<GetCustomerPaymentsQuery, CustomerPaymentsPageDto>
{
    private readonly IAppDbContext _context;
    public GetCustomerPaymentsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<CustomerPaymentsPageDto> Handle(
        GetCustomerPaymentsQuery request,
        CancellationToken cancellationToken)
    {
        var customer = await _context.Customers
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.ApplicationUserId,
                                 cancellationToken)
            ?? throw new NotFoundException("Customer", request.ApplicationUserId);

        var monthStart = new DateTime(request.Year, request.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd   = monthStart.AddMonths(1);

        // ── 1. Service fee orders for the month ───────────────────────────────
        var serviceFeeOrders = await _context.Orders
            .Include(o => o.GroupOrder)
            .Where(o => o.GroupOrderId != null
                     && o.GroupOrder!.CustomerId    == customer.Id
                     && o.WhoPaysForCompanyService == ServicePayer.Sender
                     && o.CreatedAt               >= monthStart
                     && o.CreatedAt               <  monthEnd)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(cancellationToken);

        var serviceFeeDtos = serviceFeeOrders.Select(o => new CustomerServiceFeeOrderDto(
            OrderId:                     o.Id,
            TrackingNumber:              o.TrackingNumber,
            RecipientFirstName:          o.RecipientFirstName,
            RecipientCity:               o.RecipientCity,
            RecipientDistrict:           o.RecipientDistrict,
            CompanyServicePrice:         o.CompanyServicePrice,
            OrderStatus:                 o.Status.ToString(),
            CompanyServicePaymentStatus: o.CompanyServicePaymentStatus.ToString(),
            PaymentRequestId:            o.PaymentRequestId,
            CreatedAt:                   o.CreatedAt,
            DeliveredAt:                 o.DeliveredAt
        )).ToList();

        // ── 2. SenderPaysCompany request history (all time) ───────────────────
        var paymentRequests = await _context.PaymentRequests
            .Where(p => p.CustomerId == customer.Id
                     && p.Type       == PaymentRequestType.SenderPaysCompany)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new CustomerPaymentRequestSummaryDto(
                PaymentRequestId: p.Id,
                TotalAmount:      p.TotalAmount,
                AmountConfirmed:  p.AmountConfirmed,
                Status:           p.Status.ToString(),
                CreatedAt:        p.CreatedAt,
                ConfirmedAt:      p.ConfirmedAt,
                OrderCount:       p.Orders.Count
            ))
            .ToListAsync(cancellationToken);

        // ── 3. COD income orders ──────────────────────────────────────────────
        var codOrders = await _context.Orders
            .Include(o => o.GroupOrder)
            .Where(o => o.GroupOrderId != null
                     && o.GroupOrder!.CustomerId     == customer.Id
                     && o.AmountToCollectForPackage > 0
                     && (o.Status == OrderStatus.DeliveredToRecipient
                      || !o.HasCompanyPaidTheSender))
            .OrderByDescending(o => o.DeliveredAt)
            .ToListAsync(cancellationToken);

        var codDtos = codOrders.Select(o => new CustomerCodIncomeOrderDto(
            OrderId:                 o.Id,
            TrackingNumber:          o.TrackingNumber,
            RecipientFirstName:      o.RecipientFirstName,
            RecipientCity:           o.RecipientCity,
            AmountCollected:         o.AmountToCollectForPackage ?? 0m,
            OrderStatus:             o.Status.ToString(),
            HasCompanyPaidTheSender: o.HasCompanyPaidTheSender,
            DeliveredAt:             o.DeliveredAt
        )).ToList();

        // ── 4. COD payout history (CompanyPaysSender) — shows netting ─────────
        // Load all CompanyPaysSender requests for this customer (all time, newest first).
        // This tells the customer exactly what was paid and why it may differ from gross COD.
        var codPayouts = await _context.PaymentRequests
            .Where(p => p.CustomerId == customer.Id
                     && p.Type       == PaymentRequestType.CompanyPaysSender
                     && p.Status     == PaymentRequestStatus.Confirmed)
            .OrderByDescending(p => p.ConfirmedAt)
            .Select(p => new CustomerCodPayoutDto(
                PaymentRequestId: p.Id,
                PaidAt:           p.ConfirmedAt!.Value,
                GrossCod:         p.TotalAmount,
                ServiceFeeOffset: p.ServiceFeeOffset,
                NetAmountPaid:    p.AmountConfirmed,
                Note:             p.Note,
                OrderCount:       p.Orders.Count
            ))
            .ToListAsync(cancellationToken);

        // ── 5. Totals ─────────────────────────────────────────────────────────
        var totalUnpaid = serviceFeeOrders
            .Where(o => o.CompanyServicePaymentStatus == CompanyServicePaymentStatus.Unpaid
                     && o.Status == OrderStatus.DeliveredToRecipient)
            .Sum(o => o.CompanyServicePrice);

        var totalPending = serviceFeeOrders
            .Where(o => o.CompanyServicePaymentStatus == CompanyServicePaymentStatus.Pending)
            .Sum(o => o.CompanyServicePrice);

        var totalPaid = serviceFeeOrders
            .Where(o => o.CompanyServicePaymentStatus == CompanyServicePaymentStatus.Paid)
            .Sum(o => o.CompanyServicePrice);

        var totalCodPending = codOrders
            .Where(o => !o.HasCompanyPaidTheSender && o.DeliveredAt != null)
            .Sum(o => o.AmountToCollectForPackage ?? 0m);

        var totalCodReceived = codOrders
            .Where(o => o.HasCompanyPaidTheSender)
            .Sum(o => o.AmountToCollectForPackage ?? 0m);

        return new CustomerPaymentsPageDto(
            ServiceFeeOrders:        serviceFeeDtos,
            PaymentRequests:         paymentRequests,
            CodIncomeOrders:         codDtos,
            CodPayouts:              codPayouts,
            TotalServiceFeeUnpaid:   totalUnpaid,
            TotalServiceFeePending:  totalPending,
            TotalServiceFeePaid:     totalPaid,
            TotalCodPending:         totalCodPending,
            TotalCodReceived:        totalCodReceived
        );
    }
}
