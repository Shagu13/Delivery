namespace Application.Common.Interfaces;

/// <summary>
/// Fires the courier-facing push notification and the recipient SMS for a newly
/// assigned delivery. Both are real external network calls (web push endpoint, SMS
/// gateway) — implementations run them in the background, off the request that
/// triggered the assignment, so a slow or unresponsive third party never adds to the
/// admin-facing assign-courier response time.
/// </summary>
public interface IOrderAssignmentNotifier
{
    /// <summary>
    /// Queues the "new delivery" push + recipient SMS for one order. Returns
    /// immediately — failures are logged, never surfaced to the caller.
    /// </summary>
    void NotifyCourierAssigned(
        Guid courierId,
        string recipientPhone,
        string trackingNumber,
        string? senderBusinessName,
        string recipientCity,
        string recipientDistrict);

    /// <summary>
    /// Queues the "new pickup" push for a courier assigned to collect a GroupOrder
    /// batch (no recipient/tracking number — the batch hasn't reached last-mile yet).
    /// Returns immediately — failures are logged, never surfaced to the caller.
    /// </summary>
    void NotifyCourierAssignedPickup(
        Guid courierId,
        string? senderBusinessName,
        string pickUpCity,
        string pickUpDistrict);
}
