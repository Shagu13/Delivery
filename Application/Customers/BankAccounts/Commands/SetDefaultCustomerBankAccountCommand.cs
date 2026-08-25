using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.BankAccounts.Commands;

/// <summary>Marks one of a customer's saved bank accounts as the default, clearing the flag on any other.</summary>
public sealed record SetDefaultCustomerBankAccountCommand(Guid CustomerId, Guid AccountId) : IRequest;

public sealed class SetDefaultCustomerBankAccountCommandHandler : IRequestHandler<SetDefaultCustomerBankAccountCommand>
{
    private readonly IAppDbContext _context;
    public SetDefaultCustomerBankAccountCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetDefaultCustomerBankAccountCommand request, CancellationToken cancellationToken)
    {
        var accounts = await _context.CustomerBankAccounts
            .Where(a => a.CustomerId == request.CustomerId)
            .ToListAsync(cancellationToken);
        var target = accounts.FirstOrDefault(a => a.Id == request.AccountId)
            ?? throw new NotFoundException(nameof(Domain.CustomerBankAccount), request.AccountId);

        foreach (var a in accounts) a.IsDefault = a.Id == target.Id;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
