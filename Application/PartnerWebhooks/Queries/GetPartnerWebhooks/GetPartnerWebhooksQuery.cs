using Application.PartnerWebhooks.DTOs;
using MediatR;

namespace Application.PartnerWebhooks.Queries.GetPartnerWebhooks;

/// <summary>Lists partner webhooks, optionally filtered to a single partner (Customer).</summary>
public sealed record GetPartnerWebhooksQuery(Guid? CustomerId) : IRequest<IReadOnlyList<PartnerWebhookDto>>;
