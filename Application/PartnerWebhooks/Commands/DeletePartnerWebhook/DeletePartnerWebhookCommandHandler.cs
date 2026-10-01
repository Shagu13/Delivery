using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerWebhooks.Commands.DeletePartnerWebhook;

public sealed class DeletePartnerWebhookCommandHandler
    : IRequestHandler<DeletePartnerWebhookCommand>
{
    private readonly IAppDbContext _context;
    private readonly ICacheService _cache;

    public DeletePartnerWebhookCommandHandler(IAppDbContext context, ICacheService cache)
    {
        _context = context;
        _cache = cache;
    }

    public async Task Handle(DeletePartnerWebhookCommand request, CancellationToken cancellationToken)
    {
        var webhook = await _context.PartnerWebhooks
            .FirstOrDefaultAsync(w => w.Id == request.WebhookId, cancellationToken)
            ?? throw new NotFoundException(nameof(PartnerWebhook), request.WebhookId);

        if (!webhook.IsActive)
            return;

        webhook.IsActive      = false;
        webhook.DeactivatedAt = CustomTime.Now;
        await _context.SaveChangesAsync(cancellationToken);
        await _cache.RemoveAsync(WebhookCacheKeys.AnyActive, cancellationToken);
    }
}
