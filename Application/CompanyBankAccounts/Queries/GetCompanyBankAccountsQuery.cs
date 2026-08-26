using Application.Common.Interfaces;
using Application.CompanyBankAccounts.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CompanyBankAccounts.Queries;

/// <summary>All of the company's own bank accounts, default first.</summary>
public sealed record GetCompanyBankAccountsQuery : IRequest<List<CompanyBankAccountDto>>;

public sealed class GetCompanyBankAccountsQueryHandler
    : IRequestHandler<GetCompanyBankAccountsQuery, List<CompanyBankAccountDto>>
{
    private readonly IAppDbContext _context;
    public GetCompanyBankAccountsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<List<CompanyBankAccountDto>> Handle(
        GetCompanyBankAccountsQuery request, CancellationToken cancellationToken)
    {
        return await _context.CompanyBankAccounts
            .AsNoTracking()
            .OrderByDescending(a => a.IsDefault)
            .ThenBy(a => a.CreatedAt)
            .Select(a => new CompanyBankAccountDto(a.Id, a.Label, a.BankName, a.AccountHolderName, a.AccountNumber, a.IsDefault))
            .ToListAsync(cancellationToken);
    }
}
