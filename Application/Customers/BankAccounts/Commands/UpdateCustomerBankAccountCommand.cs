using Application.Common.Exceptions;
using Application.Common.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.BankAccounts.Commands;

/// <summary>Edits one of a customer's saved bank accounts. Does not change which account is default.</summary>
public sealed record UpdateCustomerBankAccountCommand(
    Guid    CustomerId,
    Guid    AccountId,
    string? Label,
    string  BankName,
    string  AccountHolderName,
    string  AccountNumber
) : IRequest;

public sealed class UpdateCustomerBankAccountCommandValidator : AbstractValidator<UpdateCustomerBankAccountCommand>
{
    public UpdateCustomerBankAccountCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.AccountId).NotEmpty();
        RuleFor(x => x.Label).MaximumLength(60);
        RuleFor(x => x.BankName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.AccountHolderName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.AccountNumber).NotEmpty().MaximumLength(50);
    }
}

public sealed class UpdateCustomerBankAccountCommandHandler : IRequestHandler<UpdateCustomerBankAccountCommand>
{
    private readonly IAppDbContext _context;
    public UpdateCustomerBankAccountCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(UpdateCustomerBankAccountCommand request, CancellationToken cancellationToken)
    {
        var row = await _context.CustomerBankAccounts
            .FirstOrDefaultAsync(a => a.Id == request.AccountId && a.CustomerId == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.CustomerBankAccount), request.AccountId);

        row.Label             = request.Label?.Trim() is { Length: > 0 } l ? l : null;
        row.BankName          = request.BankName.Trim();
        row.AccountHolderName = request.AccountHolderName.Trim();
        row.AccountNumber     = request.AccountNumber.Trim();

        await _context.SaveChangesAsync(cancellationToken);
    }
}
