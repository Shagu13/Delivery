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

    public async Task<SmsResult> SendPasswordResetCodeAsync(
        string phoneNumber,
        string code,
        int validForMinutes,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(phoneNumber))
        {
            _logger.LogWarning("Password reset SMS skipped: phone number is empty.");
            return SmsResult.Failure("Phone number is required.", 400);
        }

        SmsResult result = await _smsService.SendSmsAsync(
            phoneNumber,
            FormatMessage(code, validForMinutes),
            cancellationToken);

        if (result.IsSuccess)
            _logger.LogInformation(
                "Password reset SMS sent to {Phone}. SmsId={SmsId}", phoneNumber, result.Value);
        else
            // The caller turns this into a friendly message; the raw gateway error stays in the log.
            _logger.LogError(
                "Failed to send password reset SMS to {Phone}: {Error}", phoneNumber, result.Error);

        return result;
    }

    // ── Message formatter ────────────────────────────────────────────────────

    private static string FormatMessage(string code, int validForMinutes) =>
        $"ერთჯერადი კოდი: {code}";
}
