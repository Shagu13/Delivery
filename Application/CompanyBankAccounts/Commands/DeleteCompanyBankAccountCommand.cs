using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CompanyBankAccounts.Commands;

/// <summary>Removes one of the company's own bank accounts. If the removed account was the
/// default and others remain, the oldest remaining account is promoted to default.</summary>
public sealed record DeleteCompanyBankAccountCommand(Guid AccountId) : IRequest;

public sealed class DeleteCompanyBankAccountCommandHandler : IRequestHandler<DeleteCompanyBankAccountCommand>
{
    private readonly IAppDbContext _context;
    public DeleteCompanyBankAccountCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(DeleteCompanyBankAccountCommand request, CancellationToken cancellationToken)
    {
        var accounts = await _context.CompanyBankAccounts.ToListAsync(cancellationToken);
        var row = accounts.FirstOrDefault(a => a.Id == request.AccountId)
            ?? throw new NotFoundException(nameof(Domain.CompanyBankAccount), request.AccountId);

        _context.CompanyBankAccounts.Remove(row);

        if (row.IsDefault)
        {
            var next = accounts.Where(a => a.Id != row.Id).OrderBy(a => a.CreatedAt).FirstOrDefault();
            if (next != null) next.IsDefault = true;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
