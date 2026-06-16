using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Common.Security;
using Application.PartnerApiKeys.DTOs;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerApiKeys.Commands.IssuePartnerApiKey;

public sealed class IssuePartnerApiKeyCommandHandler
    : IRequestHandler<IssuePartnerApiKeyCommand, IssuePartnerApiKeyResultDto>
{
    private readonly IAppDbContext _context;

    public IssuePartnerApiKeyCommandHandler(IAppDbContext context) => _context = context;

    public async Task<IssuePartnerApiKeyResultDto> Handle(
        IssuePartnerApiKeyCommand request,
        CancellationToken cancellationToken)
    {
        var customerExists = await _context.Customers
            .AnyAsync(c => c.Id == request.CustomerId, cancellationToken);
        if (!customerExists)
            throw new NotFoundException(nameof(Customer), request.CustomerId);

        var (rawKey, keyPrefix) = ApiKeyHasher.Generate();

        var apiKey = new PartnerApiKey
        {
            CustomerId = request.CustomerId,
            Name       = request.Name.Trim(),
            KeyHash    = ApiKeyHasher.Hash(rawKey),
            KeyPrefix  = keyPrefix,
        };

        _context.PartnerApiKeys.Add(apiKey);
        await _context.SaveChangesAsync(cancellationToken);

        // The raw key is returned here exactly once — it is not stored and cannot be re-shown.
        return new IssuePartnerApiKeyResultDto(
            Id:         apiKey.Id,
            CustomerId: apiKey.CustomerId,
            Name:       apiKey.Name,
            KeyPrefix:  apiKey.KeyPrefix,
            ApiKey:     rawKey
        );
    }
}
