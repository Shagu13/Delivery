namespace Application.Common.Interfaces;

/// <summary>
/// High-level SMS notification service scoped to recipient alerts.
/// Sends delivery notifications directly to the order recipient's phone number.
/// </summary>
public interface IRecipientNotificationSmsService
{
    /// <summary>
    /// Fires an SMS to the recipient of an order notifying them that a courier
    /// has been assigned and will deliver within 1-3 business days.
    /// </summary>
    Task SendCourierAssignedNotificationAsync(
        string recipientPhone,
        string trackingNumber,
        string senderBusinessName,
        CancellationToken cancellationToken = default);
}
