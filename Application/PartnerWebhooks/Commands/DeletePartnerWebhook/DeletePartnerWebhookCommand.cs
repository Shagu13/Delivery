using MediatR;

namespace Application.PartnerWebhooks.Commands.DeletePartnerWebhook;

/// <summary>Admin deactivates a partner webhook. Idempotent — deactivating twice is a no-op.</summary>
public sealed record DeletePartnerWebhookCommand(Guid WebhookId) : IRequest;
