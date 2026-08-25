using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.BankAccounts.Commands;

/// <summary>Removes one of a customer's saved bank accounts. If the removed account was the
/// default and others remain, the oldest remaining account is promoted to default.</summary>
public sealed record DeleteCustomerBankAccountCommand(Guid CustomerId, Guid AccountId) : IRequest;

public sealed class DeleteCustomerBankAccountCommandHandler : IRequestHandler<DeleteCustomerBankAccountCommand>
{
    private readonly IAppDbContext _context;
    public DeleteCustomerBankAccountCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(DeleteCustomerBankAccountCommand request, CancellationToken cancellationToken)
    {
        var accounts = await _context.CustomerBankAccounts
            .Where(a => a.CustomerId == request.CustomerId)
            .ToListAsync(cancellationToken);
        var row = accounts.FirstOrDefault(a => a.Id == request.AccountId)
            ?? throw new NotFoundException(nameof(Domain.CustomerBankAccount), request.AccountId);

        _context.CustomerBankAccounts.Remove(row);

        if (row.IsDefault)
        {
            var next = accounts.Where(a => a.Id != row.Id).OrderBy(a => a.CreatedAt).FirstOrDefault();
            if (next != null) next.IsDefault = true;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
