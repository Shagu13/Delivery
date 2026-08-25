using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.BankAccounts.Commands;

/// <summary>Adds one of a customer's saved bank accounts. Capped at 5 per customer.
/// The first account a customer saves automatically becomes their default.</summary>
public sealed record AddCustomerBankAccountCommand(
    Guid    CustomerId,
    string? Label,
    string  BankName,
    string  AccountHolderName,
    string  AccountNumber
) : IRequest<Guid>;

public sealed class AddCustomerBankAccountCommandValidator : AbstractValidator<AddCustomerBankAccountCommand>
{
    public AddCustomerBankAccountCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.Label).MaximumLength(60);
        RuleFor(x => x.BankName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.AccountHolderName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.AccountNumber).NotEmpty().MaximumLength(50);
    }
}

public sealed class AddCustomerBankAccountCommandHandler : IRequestHandler<AddCustomerBankAccountCommand, Guid>
{
    public const int MaxAccountsPerCustomer = 5;

    private readonly IAppDbContext _context;
    public AddCustomerBankAccountCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(AddCustomerBankAccountCommand request, CancellationToken cancellationToken)
    {
        var existing = await _context.CustomerBankAccounts
            .Where(a => a.CustomerId == request.CustomerId)
            .ToListAsync(cancellationToken);
        if (existing.Count >= MaxAccountsPerCustomer)
            throw new ConflictException($"You can save up to {MaxAccountsPerCustomer} bank accounts.");

        var account = new CustomerBankAccount
        {
            CustomerId        = request.CustomerId,
            Label             = request.Label?.Trim() is { Length: > 0 } l ? l : null,
            BankName          = request.BankName.Trim(),
            AccountHolderName = request.AccountHolderName.Trim(),
            AccountNumber     = request.AccountNumber.Trim(),
            IsDefault         = existing.Count == 0,
        };
        _context.CustomerBankAccounts.Add(account);
        await _context.SaveChangesAsync(cancellationToken);

        return account.Id;
    }
}
