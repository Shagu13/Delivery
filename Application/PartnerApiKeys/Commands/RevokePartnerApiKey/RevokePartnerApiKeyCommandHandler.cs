using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerApiKeys.Commands.RevokePartnerApiKey;

public sealed class RevokePartnerApiKeyCommandHandler
    : IRequestHandler<RevokePartnerApiKeyCommand>
{
    private readonly IAppDbContext _context;

    public RevokePartnerApiKeyCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(RevokePartnerApiKeyCommand request, CancellationToken cancellationToken)
    {
        var key = await _context.PartnerApiKeys
            .FirstOrDefaultAsync(k => k.Id == request.KeyId, cancellationToken)
            ?? throw new NotFoundException(nameof(PartnerApiKey), request.KeyId);

        if (!key.IsActive)
            return;

        key.IsActive  = false;
        key.RevokedAt = CustomTime.Now;
        await _context.SaveChangesAsync(cancellationToken);
    }
}
