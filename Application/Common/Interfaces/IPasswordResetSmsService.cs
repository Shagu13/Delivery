namespace Application.Common.Interfaces;

/// <summary>
/// High-level SMS notification service scoped to password-reset flows.
/// Formats and delivers the one-time reset code to the user's phone number.
/// </summary>
public interface IPasswordResetSmsService
{
    /// <summary>
    /// Sends a password-reset SMS containing a 6-digit one-time code.
    /// Never throws for gateway problems — the caller needs the outcome to tell the user the
    /// SMS did not go out, so the <see cref="SmsResult"/> is returned instead of swallowed.
    /// </summary>
    /// <param name="phoneNumber">Destination phone (country code optional; the gateway adds 995).</param>
    /// <param name="code">The 6-digit code.</param>
    /// <param name="validForMinutes">Lifetime quoted in the message.</param>
    Task<SmsResult> SendPasswordResetCodeAsync(
        string phoneNumber,
        string code,
        int validForMinutes,
        CancellationToken cancellationToken = default);
}
