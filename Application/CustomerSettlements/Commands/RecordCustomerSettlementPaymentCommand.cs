using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Commands;

/// <summary>
/// Records a payment against a single batch invoice. Either or both directions may
/// be supplied in one call:
///   • <paramref name="CodPaidByCompany"/>    — COD the company pays the customer.
///   • <paramref name="ServicePaidToCompany"/> — service fee the customer pays the company.
/// Each supplied amount is stored in its plain field and added to its running total.
/// </summary>
public sealed record RecordCustomerSettlementPaymentCommand(
    Guid     SettlementId,
    decimal? CodPaidByCompany,
    decimal? ServicePaidToCompany
) : IRequest<Guid>;

public sealed class RecordCustomerSettlementPaymentCommandHandler
    : IRequestHandler<RecordCustomerSettlementPaymentCommand, Guid>
{
    private readonly IAppDbContext _context;
    public RecordCustomerSettlementPaymentCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(
        RecordCustomerSettlementPaymentCommand request,
        CancellationToken cancellationToken)
    {
        var settlement = await _context.CustomerSettlements
            .FirstOrDefaultAsync(s => s.Id == request.SettlementId
                                   && s.DateDeleted == null,
                                 cancellationToken)
            ?? throw new NotFoundException("CustomerSettlement", request.SettlementId);

        if (request.CodPaidByCompany is decimal cod)
        {
            settlement.AmountOfCollectedCodPaidByCompany       = cod;
            settlement.TotalAmountOfCollectedCodPaidByCompany += cod;
        }

        if (request.ServicePaidToCompany is decimal service)
        {
            settlement.AmountPaidToCompanyForCompanyService       = service;
            settlement.TotalAmountPaidToCompanyForCompanyService += service;

            // Reflect the new balance to the batch's sender-pays orders: fully paid
            // (outstanding <= 0) → Paid, otherwise Unpaid. Partial payments are not
            // attributed to individual orders — the remainder stays on the settlement.
            var batchOrders = settlement.GroupOrderId is Guid groupId
                ? await _context.Orders.Where(o => o.GroupOrderId == groupId).ToListAsync(cancellationToken)
                : await _context.Orders.Where(o => o.Id == settlement.OrderId).ToListAsync(cancellationToken);

            CustomerSettlementService.ApplyServicePaymentStatus(settlement, batchOrders);
        }

        settlement.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        return settlement.Id;
    }
}
