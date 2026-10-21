using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Finance;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.TenantSettlements.Commands;

/// <summary>
/// Admin records (or clears) a per-order dilo ↔ tenant settlement payment:
///   • COD dilo paid the tenant — toggled by <paramref name="CodPaid"/>; amount defaults to the
///     order's full COD when not given (tick = pay full, field = partial).
///   • Service fee the tenant paid dilo (sender-pays orders only) — toggled by <paramref name="ServicePaid"/>.
/// Writes the dilo-tier per-order fields only — never the tenant↔customer fields. Ownership-guarded:
/// the order must belong to <paramref name="TenantId"/> (from the JWT/route, validated server-side).
/// </summary>
public sealed record RecordTenantOrderPaymentCommand(
    Guid     TenantId,
    Guid     OrderId,
    decimal? CodPaidAmount,
    bool?    CodPaid,
    decimal? ServicePaidAmount,
    bool?    ServicePaid
) : IRequest<Guid>;

public sealed class RecordTenantOrderPaymentCommandHandler
    : IRequestHandler<RecordTenantOrderPaymentCommand, Guid>
{
    private readonly IAppDbContext _context;
    public RecordTenantOrderPaymentCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(RecordTenantOrderPaymentCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .Include(o => o.GroupOrder)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        // Ownership: the order's owning customer must belong to this tenant.
        bool owned = await _context.Orders.AnyAsync(o => o.Id == request.OrderId
            && ((o.GroupOrder != null && o.GroupOrder.Customer != null && o.GroupOrder.Customer.TenantId == request.TenantId)
                || (o.Customer != null && o.Customer.TenantId == request.TenantId)),
            cancellationToken);
        if (!owned)
            throw new NotFoundException("Order", request.OrderId);

        if (request.CodPaid is bool codPaid)
        {
            if (codPaid)
            {
                order.CodPaidToTenantAmount = request.CodPaidAmount ?? order.AmountToCollectForPackage ?? 0m;
                order.CodPaidToTenantAt     = CustomTime.Now;
            }
            else
            {
                order.CodPaidToTenantAmount = null;
                order.CodPaidToTenantAt     = null;
            }
        }

        if (request.ServicePaid is bool servicePaid)
        {
            // The tenant owes dilo the whole fee on a sender-pays order, only the customer surcharge
            // when the recipient pays the rest at delivery.
            decimal tenantShare = OrderFinance.SenderServiceShareOf(
                order.WhoPaysForCompanyService, order.CompanyServicePrice, order.CustomerSurcharge);
            if (order.WhoPaysForCompanyService != ServicePayer.Sender && tenantShare <= 0m)
                throw new ConflictException(
                    "The service fee for this order was collected from the recipient at delivery, not owed by the tenant.");

            if (servicePaid)
            {
                order.ServicePaidByTenantAmount = request.ServicePaidAmount ?? tenantShare;
                order.ServicePaidByTenantAt     = CustomTime.Now;
            }
            else
            {
                order.ServicePaidByTenantAmount = null;
                order.ServicePaidByTenantAt     = null;
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
        return order.Id;
    }
}
