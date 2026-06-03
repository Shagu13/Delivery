using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Commands;

/// <summary>
/// Records a payment against an existing customer settlement. Either or both
/// directions may be supplied in one call:
///   • <paramref name="CodPaidByCompany"/>    — COD the company pays the customer.
///   • <paramref name="ServicePaidToCompany"/> — service fee the customer pays the company.
/// Each supplied amount is stored in its plain field and added to its running total.
/// </summary>
public sealed record RecordCustomerSettlementPaymentCommand(
    Guid     CustomerId,
    int      Year,
    int      Month,
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
            .FirstOrDefaultAsync(s => s.CustomerId == request.CustomerId
                                   && s.Year == request.Year
                                   && s.Month == request.Month,
                                 cancellationToken)
            ?? throw new NotFoundException(
                "CustomerSettlement",
                $"customer {request.CustomerId} for {request.Year}-{request.Month:D2}");

        if (request.CodPaidByCompany is decimal cod)
        {
            settlement.AmountOfCollectedCodPaidByCompany       = cod;
            settlement.TotalAmountOfCollectedCodPaidByCompany += cod;
        }

        if (request.ServicePaidToCompany is decimal service)
        {
            settlement.AmountPaidToCompanyForCompanyService       = service;
            settlement.TotalAmountPaidToCompanyForCompanyService += service;
        }

        settlement.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        return settlement.Id;
    }
}
