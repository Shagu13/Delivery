namespace Domain.Enums;

/// <summary>Lifecycle of a single webhook delivery attempt record (the outbox row).</summary>
public enum WebhookDeliveryStatus
{
    /// <summary>Awaiting first send or a scheduled retry.</summary>
    Pending   = 0,
    /// <summary>Endpoint returned a 2xx — done.</summary>
    Delivered = 1,
    /// <summary>All retry attempts exhausted without success.</summary>
    Failed    = 2,
    /// <summary>The target webhook was removed/deactivated before delivery — abandoned.</summary>
    Skipped   = 3,
}
