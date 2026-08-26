using Application.Common.Exceptions;
using Application.Common.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CompanyBankAccounts.Commands;

/// <summary>Edits one of the company's own bank accounts. Does not change which account is default.</summary>
public sealed record UpdateCompanyBankAccountCommand(
    Guid    AccountId,
    string? Label,
    string  BankName,
    string  AccountHolderName,
    string  AccountNumber
) : IRequest;

public sealed class UpdateCompanyBankAccountCommandValidator : AbstractValidator<UpdateCompanyBankAccountCommand>
{
    public UpdateCompanyBankAccountCommandValidator()
    {
        RuleFor(x => x.AccountId).NotEmpty();
        RuleFor(x => x.Label).MaximumLength(60);
        RuleFor(x => x.BankName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.AccountHolderName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.AccountNumber).NotEmpty().MaximumLength(50);
    }
}

public sealed class UpdateCompanyBankAccountCommandHandler : IRequestHandler<UpdateCompanyBankAccountCommand>
{
    private readonly IAppDbContext _context;
    public UpdateCompanyBankAccountCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(UpdateCompanyBankAccountCommand request, CancellationToken cancellationToken)
    {
        var row = await _context.CompanyBankAccounts
            .FirstOrDefaultAsync(a => a.Id == request.AccountId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.CompanyBankAccount), request.AccountId);

        row.Label             = request.Label?.Trim() is { Length: > 0 } l ? l : null;
        row.BankName          = request.BankName.Trim();
        row.AccountHolderName = request.AccountHolderName.Trim();
        row.AccountNumber     = request.AccountNumber.Trim();

        await _context.SaveChangesAsync(cancellationToken);
    }
}
