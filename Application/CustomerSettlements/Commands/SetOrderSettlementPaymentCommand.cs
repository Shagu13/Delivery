using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

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
    bool?    ServicePaid
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
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (request.CodPaid is bool codPaid)
        {
            if (codPaid)
            {
                order.IsCollectedCodPaidToCustomer = true;
                order.CodPaidToCustomerAmount      = request.CodPaidAmount ?? order.AmountToCollectForPackage ?? 0m;
                order.CodPaidToCustomerAt          = DateTime.UtcNow;
            }
            else
            {
                order.IsCollectedCodPaidToCustomer = false;
                order.CodPaidToCustomerAmount      = null;
                order.CodPaidToCustomerAt          = null;
            }
        }

        if (request.ServicePaid is bool servicePaid)
        {
            if (order.WhoPaysForCompanyService != ServicePayer.Sender)
                throw new ConflictException(
                    "The service fee for this order is collected from the recipient at delivery, not invoiced to the sender.");

            if (servicePaid)
            {
                order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
                order.ServicePaidByCustomerAmount = request.ServicePaidAmount ?? order.CompanyServicePrice;
                order.ServicePaidByCustomerAt     = DateTime.UtcNow;
            }
            else
            {
                order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Unpaid;
                order.ServicePaidByCustomerAmount = null;
                order.ServicePaidByCustomerAt     = null;
            }
        }

        await _context.SaveChangesAsync(cancellationToken);

        // Refresh the batch/return rollup so company-wide figures reconcile.
        await CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);

        return order.Id;
    }
}
