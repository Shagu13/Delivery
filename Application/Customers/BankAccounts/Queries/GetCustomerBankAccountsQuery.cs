using Application.Common.Interfaces;
using Application.Customers.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.BankAccounts.Queries;

/// <summary>All of a customer's saved bank accounts, default first.</summary>
public sealed record GetCustomerBankAccountsQuery(Guid CustomerId) : IRequest<List<CustomerBankAccountDto>>;

public sealed class GetCustomerBankAccountsQueryHandler
    : IRequestHandler<GetCustomerBankAccountsQuery, List<CustomerBankAccountDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomerBankAccountsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<List<CustomerBankAccountDto>> Handle(
        GetCustomerBankAccountsQuery request, CancellationToken cancellationToken)
    {
        return await _context.CustomerBankAccounts
            .AsNoTracking()
            .Where(a => a.CustomerId == request.CustomerId)
            .OrderByDescending(a => a.IsDefault)
            .ThenBy(a => a.CreatedAt)
            .Select(a => new CustomerBankAccountDto(a.Id, a.Label, a.BankName, a.AccountHolderName, a.AccountNumber, a.IsDefault))
            .ToListAsync(cancellationToken);
    }
}
