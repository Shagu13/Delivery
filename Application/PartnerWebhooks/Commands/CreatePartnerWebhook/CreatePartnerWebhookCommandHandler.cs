using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Common.Security;
using Application.PartnerWebhooks.DTOs;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerWebhooks.Commands.CreatePartnerWebhook;

public sealed class CreatePartnerWebhookCommandHandler
    : IRequestHandler<CreatePartnerWebhookCommand, PartnerWebhookDto>
{
    private readonly IAppDbContext _context;

    public CreatePartnerWebhookCommandHandler(IAppDbContext context) => _context = context;

    public async Task<PartnerWebhookDto> Handle(
        CreatePartnerWebhookCommand request,
        CancellationToken cancellationToken)
    {
        var customer = await _context.Customers
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException(nameof(Customer), request.CustomerId);

        var webhook = new PartnerWebhook
        {
            CustomerId = request.CustomerId,
            Url        = request.Url.Trim(),
            Secret     = WebhookSigner.GenerateSecret(),
        };

        _context.PartnerWebhooks.Add(webhook);
        await _context.SaveChangesAsync(cancellationToken);

        return new PartnerWebhookDto(
            webhook.Id,
            webhook.CustomerId,
            customer.BusinessName,
            webhook.Url,
            webhook.Secret,
            webhook.IsActive,
            webhook.CreatedAt);
    }
}
