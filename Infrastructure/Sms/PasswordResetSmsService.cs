using Application.Common.Interfaces;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Sms;

/// <summary>
/// Sends password-reset SMS notifications for DILO account recovery.
/// Formats a concise Georgian message and delegates delivery to ISmsService.
/// </summary>
public sealed class PasswordResetSmsService : IPasswordResetSmsService
{
    private readonly ISmsService _smsService;
    private readonly ILogger<PasswordResetSmsService> _logger;

    public PasswordResetSmsService(
        ISmsService smsService,
        ILogger<PasswordResetSmsService> logger)
    {
        _smsService = smsService;
        _logger     = logger;
    }

    public async Task SendPasswordResetLinkAsync(
        string phoneNumber,
        string resetLink,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(phoneNumber))
        {
            _logger.LogWarning(
                "Password reset SMS skipped: phone number is empty.");
            return;
        }

        var message = FormatMessage(resetLink);

        var result = await _smsService.SendSmsAsync(
            phoneNumber,
            message,
            cancellationToken);

        if (result.IsSuccess)
        {
            _logger.LogInformation(
                "Password reset SMS sent to {Phone}. SmsId={SmsId}",
                phoneNumber, result.Value);
        }
        else
        {
            // Log and continue — a failed SMS must never surface a 500 to the caller.
            // The endpoint always returns 200 to avoid leaking account existence.
            _logger.LogError(
                "Failed to send password reset SMS to {Phone}: {Error}",
                phoneNumber, result.Error);
        }
    }

    // ── Message formatter ────────────────────────────────────────────────────

    private static string FormatMessage(string resetLink) =>
        $"DILO: პაროლის აღსადგენად გადადით ბმულზე:\n" +
        $"{resetLink}\n" +
        $"თუ ეს მოთხოვნა არ გამოგიგზავნიათ, უგულებელყავით ეს შეტყობინება.";
}
