using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Admin: every customer that still has an outstanding balance in either direction —
/// COD the company owes them, or sender-paid service fees they owe the company —
/// aggregated across all their non-deleted batch invoices. Customers fully settled
/// in both directions are omitted.
/// </summary>
public sealed record GetCustomersWithOutstandingBalancesQuery
    : IRequest<IReadOnlyList<CustomerOutstandingDto>>;

public sealed class GetCustomersWithOutstandingBalancesQueryHandler
    : IRequestHandler<GetCustomersWithOutstandingBalancesQuery, IReadOnlyList<CustomerOutstandingDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomersWithOutstandingBalancesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CustomerOutstandingDto>> Handle(
        GetCustomersWithOutstandingBalancesQuery request,
        CancellationToken cancellationToken)
    {
        // Sum the two outstanding flows per customer over all their live invoices.
        var aggregates = await _context.CustomerSettlements
            .AsNoTracking()
            .Where(s => s.DateDeleted == null)
            .GroupBy(s => s.CustomerId)
            .Select(g => new
            {
                CustomerId         = g.Key,
                OutstandingCod     = g.Sum(s => s.TotalCODCompanyCollectedForPackages
                                              - s.TotalAmountOfCollectedCodPaidByCompany),
                OutstandingService = g.Sum(s => s.TotalCompanyServicePriceOwedToCompany
                                              - s.TotalAmountPaidToCompanyForCompanyService),
            })
            .ToListAsync(cancellationToken);

        // Keep only customers who still owe or are owed something (ignore FP residue).
        var owing = aggregates
            .Where(a => a.OutstandingCod > 0.005m || a.OutstandingService > 0.005m)
            .ToList();

        if (owing.Count == 0)
            return new List<CustomerOutstandingDto>();

        var ids = owing.Select(a => a.CustomerId).ToList();
        var customers = await _context.Customers
            .AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        return owing
            // Reconciliation: tenant customers are settled by their tenant, not the company —
            // hide them from the company's per-customer settlement list.
            .Where(a => customers.ContainsKey(a.CustomerId) && customers[a.CustomerId].TenantId == null)
            .Select(a =>
            {
                var c = customers[a.CustomerId];
                return new CustomerOutstandingDto(
                    CustomerId:                      a.CustomerId,
                    BusinessName:                    c.BusinessName,
                    FirstName:                       c.FirstName,
                    LastName:                        c.LastName,
                    PhoneNumber:                     c.PhoneNumber,
                    OutstandingCodOwedToCustomer:    Math.Max(0m, a.OutstandingCod),
                    OutstandingServiceOwedToCompany: Math.Max(0m, a.OutstandingService));
            })
            .OrderByDescending(d => d.OutstandingCodOwedToCustomer + d.OutstandingServiceOwedToCompany)
            .ToList();
    }
}
