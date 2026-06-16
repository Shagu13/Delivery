using Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerWebhooks.Commands.CreatePartnerWebhook;

public sealed class CreatePartnerWebhookCommandValidator : AbstractValidator<CreatePartnerWebhookCommand>
{
    public CreatePartnerWebhookCommandValidator(IAppDbContext context)
    {
        RuleFor(x => x.Url)
            .NotEmpty().MaximumLength(500)
            .Must(BeAnAbsoluteHttpUrl)
            .WithMessage("Url must be an absolute http(s) URL.");

        RuleFor(x => x.CustomerId)
            .MustAsync(async (id, ct) =>
                await context.Customers.AnyAsync(c => c.Id == id, ct))
            .WithMessage("Customer not found.");
    }

    private static bool BeAnAbsoluteHttpUrl(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
