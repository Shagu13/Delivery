using Domain;

namespace Application.Common.Interfaces;

/// <summary>
/// High-level SMS notification service scoped to admin alerts.
/// Knows how to find the admin's phone number and format DILO messages.
/// </summary>
public interface IAdminNotificationSmsService
{
    /// <summary>
    /// Fires an SMS to every admin user that has a phone number set,
    /// notifying them that a new GroupOrder has been created and is pending review.
    /// </summary>
    Task SendNewGroupOrderNotificationAsync(
        GroupOrder groupOrder,
        CancellationToken cancellationToken = default);
}
