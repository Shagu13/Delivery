using Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerApiKeys.Commands.IssuePartnerApiKey;

public sealed class IssuePartnerApiKeyCommandValidator : AbstractValidator<IssuePartnerApiKeyCommand>
{
    public IssuePartnerApiKeyCommandValidator(IAppDbContext context)
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);

        RuleFor(x => x.CustomerId)
            .MustAsync(async (id, ct) =>
                await context.Customers.AnyAsync(c => c.Id == id, ct))
            .WithMessage("Customer not found.");
    }
}
