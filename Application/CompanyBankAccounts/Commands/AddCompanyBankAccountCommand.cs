using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CompanyBankAccounts.Commands;

/// <summary>Adds one of the company's own bank accounts. The first account added
/// automatically becomes the default.</summary>
public sealed record AddCompanyBankAccountCommand(
    string? Label,
    string  BankName,
    string  AccountHolderName,
    string  AccountNumber
) : IRequest<Guid>;

public sealed class AddCompanyBankAccountCommandValidator : AbstractValidator<AddCompanyBankAccountCommand>
{
    public AddCompanyBankAccountCommandValidator()
    {
        RuleFor(x => x.Label).MaximumLength(60);
        RuleFor(x => x.BankName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.AccountHolderName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.AccountNumber).NotEmpty().MaximumLength(50);
    }
}

public sealed class AddCompanyBankAccountCommandHandler : IRequestHandler<AddCompanyBankAccountCommand, Guid>
{
    private readonly IAppDbContext _context;
    public AddCompanyBankAccountCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(AddCompanyBankAccountCommand request, CancellationToken cancellationToken)
    {
        var hasAny = await _context.CompanyBankAccounts.AnyAsync(cancellationToken);

        var account = new CompanyBankAccount
        {
            Label             = request.Label?.Trim() is { Length: > 0 } l ? l : null,
            BankName          = request.BankName.Trim(),
            AccountHolderName = request.AccountHolderName.Trim(),
            AccountNumber     = request.AccountNumber.Trim(),
            IsDefault         = !hasAny,
        };
        _context.CompanyBankAccounts.Add(account);
        await _context.SaveChangesAsync(cancellationToken);

        return account.Id;
    }
}
