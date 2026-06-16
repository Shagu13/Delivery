using Application.PartnerApiKeys.DTOs;
using MediatR;

namespace Application.PartnerApiKeys.Queries.GetPartnerApiKeys;

/// <summary>Lists partner API keys, optionally filtered to a single partner (Customer).</summary>
public sealed record GetPartnerApiKeysQuery(Guid? CustomerId) : IRequest<IReadOnlyList<PartnerApiKeyDto>>;
