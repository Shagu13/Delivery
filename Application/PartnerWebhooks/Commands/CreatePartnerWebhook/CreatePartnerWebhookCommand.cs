using Application.PartnerWebhooks.DTOs;
using MediatR;

namespace Application.PartnerWebhooks.Commands.CreatePartnerWebhook;

/// <summary>Admin registers a webhook endpoint for a partner (Customer).</summary>
public sealed record CreatePartnerWebhookCommand(
    Guid   CustomerId,
    string Url
) : IRequest<PartnerWebhookDto>;
