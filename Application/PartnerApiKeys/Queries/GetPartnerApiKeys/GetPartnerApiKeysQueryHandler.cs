using Application.Common.Interfaces;
using Application.PartnerApiKeys.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerApiKeys.Queries.GetPartnerApiKeys;

public sealed class GetPartnerApiKeysQueryHandler
    : IRequestHandler<GetPartnerApiKeysQuery, IReadOnlyList<PartnerApiKeyDto>>
{
    private readonly IAppDbContext _context;

    public GetPartnerApiKeysQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<PartnerApiKeyDto>> Handle(
        GetPartnerApiKeysQuery request,
        CancellationToken cancellationToken)
    {
        var query = _context.PartnerApiKeys.AsNoTracking();

        if (request.CustomerId.HasValue)
            query = query.Where(k => k.CustomerId == request.CustomerId.Value);

        return await query
            .OrderByDescending(k => k.CreatedAt)
            .Select(k => new PartnerApiKeyDto(
                k.Id,
                k.CustomerId,
                k.Customer!.BusinessName,
                k.Name,
                k.KeyPrefix,
                k.IsActive,
                k.CreatedAt,
                k.LastUsedAt,
                k.RevokedAt))
            .ToListAsync(cancellationToken);
    }
}
