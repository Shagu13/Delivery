using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Domain;

/// <summary>
/// Outbox row for one webhook event to one endpoint. Written in response to an
/// order status change, then picked up and POSTed by the background sender with
/// at-least-once delivery and exponential-backoff retries. The payload is frozen
/// at enqueue time so retries always send the same body (and signature).
/// </summary>
[Index(nameof(Status), nameof(NextAttemptAt))]
public class WebhookDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid            WebhookId { get; set; }
    public PartnerWebhook? Webhook   { get; set; }

    /// <summary>Denormalised owner, kept so deliveries can be queried per partner cheaply.</summary>
    public Guid CustomerId { get; set; }

    public required string EventType   { get; set; }
    public required string PayloadJson { get; set; }

    public WebhookDeliveryStatus Status { get; set; } = WebhookDeliveryStatus.Pending;

    public int       AttemptCount       { get; set; }
    public DateTime  NextAttemptAt      { get; set; } = DateTime.UtcNow;
    public DateTime  CreatedAt          { get; set; } = DateTime.UtcNow;
    public DateTime? LastAttemptAt      { get; set; }
    public int?      ResponseStatusCode { get; set; }
    public string?   LastError          { get; set; }
}
