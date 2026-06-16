using Application.PartnerApiKeys.DTOs;
using MediatR;

namespace Application.PartnerApiKeys.Commands.IssuePartnerApiKey;

/// <summary>Admin issues a new API key to a partner (Customer). Returns the raw key once.</summary>
public sealed record IssuePartnerApiKeyCommand(
    Guid   CustomerId,
    string Name
) : IRequest<IssuePartnerApiKeyResultDto>;
