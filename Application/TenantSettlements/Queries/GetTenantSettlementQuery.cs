using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.TenantSettlements.DTOs;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.TenantSettlements.Queries;

/// <summary>
/// Admin: the monthly tenant ↔ company settlement for (TenantId, Year, Month). Ensures the
/// row exists and refreshes its order-derived aggregates before returning.
/// </summary>
public sealed record GetTenantSettlementQuery(Guid TenantId, int Year, int Month)
    : IRequest<TenantSettlementDto>;

public sealed class GetTenantSettlementQueryHandler
    : IRequestHandler<GetTenantSettlementQuery, TenantSettlementDto>
{
    private readonly IAppDbContext _context;
    public GetTenantSettlementQueryHandler(IAppDbContext context) => _context = context;

    public async Task<TenantSettlementDto> Handle(GetTenantSettlementQuery request, CancellationToken cancellationToken)
    {
        var tenant = await _context.Tenants
            .FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken)
            ?? throw new NotFoundException(nameof(Tenant), request.TenantId);

        var row = await TenantSettlementService.EnsureAndRecomputeAsync(
            _context, request.TenantId, request.Year, request.Month, cancellationToken);

        return TenantSettlementService.ToDto(row, tenant.DisplayName);
    }
}
