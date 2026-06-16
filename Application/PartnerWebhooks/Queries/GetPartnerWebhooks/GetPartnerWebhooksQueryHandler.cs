using Application.Common.Interfaces;
using Application.PartnerWebhooks.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerWebhooks.Queries.GetPartnerWebhooks;

public sealed class GetPartnerWebhooksQueryHandler
    : IRequestHandler<GetPartnerWebhooksQuery, IReadOnlyList<PartnerWebhookDto>>
{
    private readonly IAppDbContext _context;

    public GetPartnerWebhooksQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<PartnerWebhookDto>> Handle(
        GetPartnerWebhooksQuery request,
        CancellationToken cancellationToken)
    {
        var query = _context.PartnerWebhooks.AsNoTracking();

        if (request.CustomerId.HasValue)
            query = query.Where(w => w.CustomerId == request.CustomerId.Value);

        return await query
            .OrderByDescending(w => w.CreatedAt)
            .Select(w => new PartnerWebhookDto(
                w.Id,
                w.CustomerId,
                w.Customer!.BusinessName,
                w.Url,
                w.Secret,
                w.IsActive,
                w.CreatedAt))
            .ToListAsync(cancellationToken);
    }
}
