using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Finance;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

using Domain;
namespace Application.CustomerSettlements.Commands;

/// <summary>
/// Records (or clears) a settlement payment against a single order. Either or both
/// directions may be supplied:
///   • COD payout (company → customer) — toggled by <paramref name="CodPaid"/>; the
///     amount defaults to the order's package COD when not given.
///   • Service fee (customer → company, sender-pays only) — toggled by
///     <paramref name="ServicePaid"/>; the amount defaults to the order's service price.
/// The per-order fields are the source of truth; the batch <see cref="Domain.CustomerSettlement"/>
/// rollup is refreshed afterwards so company-wide figures stay in sync.
/// </summary>
public sealed record SetOrderSettlementPaymentCommand(
    Guid     OrderId,
    decimal? CodPaidAmount,
    bool?    CodPaid,
    decimal? ServicePaidAmount,
    bool?    ServicePaid,
    /// <summary>
    /// When true (the company/dilo admin path), reject orders whose owning customer belongs
    /// to a tenant — those are settled by the tenant, not the company. The tenant's own
    /// payment path leaves this false (it has already verified tenant ownership).
    /// </summary>
    bool     RequireRootCustomer = false
) : IRequest<Guid>;

public sealed class SetOrderSettlementPaymentCommandHandler
    : IRequestHandler<SetOrderSettlementPaymentCommand, Guid>
{
    private readonly IAppDbContext _context;
    public SetOrderSettlementPaymentCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(
        SetOrderSettlementPaymentCommand request,
        CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .Include(o => o.GroupOrder)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        // Reconciliation: the company never settles a tenant customer's order directly —
        // the tenant pays its own customers (and the company settles with the tenant).
        if (request.RequireRootCustomer)
        {
            bool tenantOwned = await _context.Orders.AnyAsync(o => o.Id == request.OrderId
                && ((o.GroupOrder != null && o.GroupOrder.Customer != null && o.GroupOrder.Customer.TenantId != null)
                    || (o.Customer != null && o.Customer.TenantId != null)),
                cancellationToken);
            if (tenantOwned)
                throw new ConflictException(
                    "This order belongs to a tenant customer and is settled by the tenant, not the company.");
        }

        var now = CustomTime.Now;

        if (request.CodPaid is bool codPaid)
        {
            if (codPaid)
            {
                decimal cod = order.AmountToCollectForPackage ?? 0m;
                decimal amt = request.CodPaidAmount ?? cod;

                order.IsCollectedCodPaidToCustomer = true;
                order.CodPaidToCustomerAmount      = amt;
                order.CodPaidToCustomerAt          = now;

                // Case 3 auto-net: fully paying the COD on an unpaid, sender-pays order
                // retains the service fee out of the payout and settles it in one step.
                bool case3     = order.ProductPaymentStatus == PaymentStatus.NotPaid
                              && order.WhoPaysForCompanyService == ServicePayer.Sender;
                bool fullyPaid = amt >= cod - 0.005m;
                if (case3 && fullyPaid && order.CompanyServicePrice > 0m)
                {
                    order.IsCompanyServicePriceIncludedSpecialCase = true;
                    order.ServicePaidByCustomerAmount              = order.CompanyServicePrice;
                    order.ServicePaidByCustomerAt                  = now;
                    order.CompanyServicePaymentStatus              = CompanyServicePaymentStatus.Paid;
                }
            }
            else
            {
                order.IsCollectedCodPaidToCustomer = false;
                order.CodPaidToCustomerAmount      = null;
                order.CodPaidToCustomerAt          = null;

                // Reverse an auto-netted service settlement when the COD payout is cleared.
                if (order.IsCompanyServicePriceIncludedSpecialCase)
                {
                    order.IsCompanyServicePriceIncludedSpecialCase = false;
                    order.ServicePaidByCustomerAmount              = null;
                    order.ServicePaidByCustomerAt                  = null;
                    order.CompanyServicePaymentStatus              = CompanyServicePaymentStatus.Unpaid;
                }
            }
        }

        if (request.ServicePaid is bool servicePaid)
        {
            // The fee is invoiced to the sender for sender-pays orders and for billable failed
            // deliveries (the recipient declined, so the fee shifts to the sender) — even when
            // the order was originally recipient-pays.
            if (order.WhoPaysForCompanyService != ServicePayer.Sender
                && !OrderFinance.IsBillableFailedDelivery(order))
                throw new ConflictException(
                    "The service fee for this order is collected from the recipient at delivery, not invoiced to the sender.");

            if (servicePaid)
            {
                // Explicit direct payment — not a COD-netting special case.
                order.IsCompanyServicePriceIncludedSpecialCase = false;
                order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
                order.ServicePaidByCustomerAmount = request.ServicePaidAmount ?? order.CompanyServicePrice;
                order.ServicePaidByCustomerAt     = now;
            }
            else
            {
                order.IsCompanyServicePriceIncludedSpecialCase = false;
                order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Unpaid;
                order.ServicePaidByCustomerAmount = null;
                order.ServicePaidByCustomerAt     = null;
            }
        }

        // Persist a receipt for each flow actually paid here (not on clear/unset — a
        // reversal isn't a payment). Mirrors PayCustomerOrdersCommandHandler: an auto-netted
        // service settlement (Case 3, above) doesn't get its own receipt, only the flow the
        // caller explicitly toggled does.
        var customerId = order.GroupOrder?.CustomerId ?? order.CustomerId;
        if (customerId is Guid resolvedCustomerId)
        {
            if (request.CodPaid == true && (order.CodPaidToCustomerAmount ?? 0m) > 0m)
                _context.PaymentReceipts.Add(BuildReceipt(
                    resolvedCustomerId, isService: false, order.Id, order.CodPaidToCustomerAmount!.Value, now));

            if (request.ServicePaid == true && (order.ServicePaidByCustomerAmount ?? 0m) > 0m)
                _context.PaymentReceipts.Add(BuildReceipt(
                    resolvedCustomerId, isService: true, order.Id, order.ServicePaidByCustomerAmount!.Value, now));
        }

        await _context.SaveChangesAsync(cancellationToken);
        return order.Id;
    }

    private static PaymentReceipt BuildReceipt(Guid customerId, bool isService, Guid orderId, decimal amount, DateTime now)
    {
        var receipt = new PaymentReceipt { CustomerId = customerId, IsService = isService, TotalAmount = amount, PaidAt = now };
        receipt.Allocations.Add(new PaymentReceiptAllocation { OrderId = orderId, Amount = amount });
        return receipt;
    }
}
