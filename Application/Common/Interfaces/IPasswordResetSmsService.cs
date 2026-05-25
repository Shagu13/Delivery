namespace Application.Common.Interfaces;

/// <summary>
/// High-level SMS notification service scoped to password-reset flows.
/// Formats and delivers the one-time reset link to the user's phone number.
/// </summary>
public interface IPasswordResetSmsService
{
    /// <summary>
    /// Sends a password-reset SMS containing a one-time link to the given phone number.
    /// </summary>
    /// <param name="phoneNumber">Destination phone in international format (e.g. 995599123456).</param>
    /// <param name="resetLink">The fully-qualified reset URL including userId and token query params.</param>
    /// <param name="cancellationToken"></param>
    Task SendPasswordResetLinkAsync(
        string phoneNumber,
        string resetLink,
        CancellationToken cancellationToken = default);
}
