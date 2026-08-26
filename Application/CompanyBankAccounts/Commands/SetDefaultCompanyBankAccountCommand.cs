using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CompanyBankAccounts.Commands;

/// <summary>Marks one of the company's own bank accounts as the default, clearing the flag on any other.</summary>
public sealed record SetDefaultCompanyBankAccountCommand(Guid AccountId) : IRequest;

public sealed class SetDefaultCompanyBankAccountCommandHandler : IRequestHandler<SetDefaultCompanyBankAccountCommand>
{
    private readonly IAppDbContext _context;
    public SetDefaultCompanyBankAccountCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetDefaultCompanyBankAccountCommand request, CancellationToken cancellationToken)
    {
        var accounts = await _context.CompanyBankAccounts.ToListAsync(cancellationToken);
        var target = accounts.FirstOrDefault(a => a.Id == request.AccountId)
            ?? throw new NotFoundException(nameof(Domain.CompanyBankAccount), request.AccountId);

        foreach (var a in accounts) a.IsDefault = a.Id == target.Id;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
