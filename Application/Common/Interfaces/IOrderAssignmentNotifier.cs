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

    /// <summary>
    /// Bulk form of <see cref="NotifyCourierAssigned"/>: ONE background job for the whole
    /// selection — a single "N new deliveries" push to the courier and one recipient SMS per
    /// order, all sent from one DI scope. Use this from any handler that hands several orders
    /// to the same courier, so an N-order assign doesn't spawn N scopes, N subscription
    /// queries and N lock-screen alerts. Returns immediately; failures are logged.
    /// </summary>
    void NotifyCourierAssignedBulk(Guid courierId, IReadOnlyList<AssignedDeliveryNotice> deliveries);

    /// <summary>
    /// Bulk form of <see cref="NotifyCourierAssignedPickup"/>: one "N new pickups" push for
    /// all batches handed to the courier. Returns immediately; failures are logged.
    /// </summary>
    void NotifyCourierAssignedPickupBulk(Guid courierId, IReadOnlyList<AssignedPickupNotice> pickups);
}

/// <summary>What the recipient SMS and the courier push need to know about one assigned delivery.</summary>
public sealed record AssignedDeliveryNotice(
    string RecipientPhone,
    string TrackingNumber,
    string? SenderBusinessName,
    string RecipientCity,
    string RecipientDistrict);

/// <summary>What the courier push needs to know about one assigned pickup batch.</summary>
public sealed record AssignedPickupNotice(
    string? SenderBusinessName,
    string PickUpCity,
    string PickUpDistrict);
