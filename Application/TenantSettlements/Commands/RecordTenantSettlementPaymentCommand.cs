using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.TenantSettlements.DTOs;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.TenantSettlements.Commands;

/// <summary>
/// Dilo-admin records a payment on the monthly tenant ↔ company settlement: either the COD
/// the company paid out to the tenant, or the service fee the tenant paid the company.
/// Accumulating, like CustomerSettlement: the plain field holds this payment, the Total*
/// field the running sum. Ensures the (tenant, year, month) row + aggregates first.
/// </summary>
public sealed record RecordTenantSettlementPaymentCommand(
    Guid     TenantId,
    int      Year,
    int      Month,
    decimal? CodPaidToTenant,
    decimal? ServicePaidByTenant
) : IRequest<TenantSettlementDto>;

public sealed class RecordTenantSettlementPaymentCommandValidator
    : AbstractValidator<RecordTenantSettlementPaymentCommand>
{
    public RecordTenantSettlementPaymentCommandValidator()
    {
        RuleFor(x => x.Month).InclusiveBetween(1, 12);
        RuleFor(x => x.Year).InclusiveBetween(2000, 3000);
        RuleFor(x => x.CodPaidToTenant).GreaterThan(0).When(x => x.CodPaidToTenant.HasValue);
        RuleFor(x => x.ServicePaidByTenant).GreaterThan(0).When(x => x.ServicePaidByTenant.HasValue);
        RuleFor(x => x).Must(x => x.CodPaidToTenant.HasValue || x.ServicePaidByTenant.HasValue)
            .WithMessage("Provide a COD or service payment amount.");
    }
}

public sealed class RecordTenantSettlementPaymentCommandHandler
    : IRequestHandler<RecordTenantSettlementPaymentCommand, TenantSettlementDto>
{
    private readonly IAppDbContext _context;
    public RecordTenantSettlementPaymentCommandHandler(IAppDbContext context) => _context = context;

    public async Task<TenantSettlementDto> Handle(RecordTenantSettlementPaymentCommand request, CancellationToken cancellationToken)
    {
        var tenant = await _context.Tenants
            .FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken)
            ?? throw new NotFoundException(nameof(Tenant), request.TenantId);

        var row = await TenantSettlementService.EnsureAndRecomputeAsync(
            _context, request.TenantId, request.Year, request.Month, cancellationToken);

        if (request.CodPaidToTenant is decimal cod)
        {
            row.AmountOfCollectedCodPaidToTenant       = cod;
            row.TotalAmountOfCollectedCodPaidToTenant += cod;
        }

        if (request.ServicePaidByTenant is decimal service)
        {
            row.AmountPaidToCompanyForCompanyService       = service;
            row.TotalAmountPaidToCompanyForCompanyService += service;
        }

        row.UpdatedAt = CustomTime.Now;
        await _context.SaveChangesAsync(cancellationToken);

        return TenantSettlementService.ToDto(row, tenant.DisplayName);
    }
}
