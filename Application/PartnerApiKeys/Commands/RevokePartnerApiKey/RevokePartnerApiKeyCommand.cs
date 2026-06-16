using MediatR;

namespace Application.PartnerApiKeys.Commands.RevokePartnerApiKey;

/// <summary>Admin revokes a partner API key. Idempotent — revoking twice is a no-op.</summary>
public sealed record RevokePartnerApiKeyCommand(Guid KeyId) : IRequest;
