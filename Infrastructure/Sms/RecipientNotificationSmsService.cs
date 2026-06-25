using Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Sms;

/// <summary>
/// Sends recipient-facing SMS alerts for DILO delivery events.
/// Notifies the recipient directly using the phone number stored on the order.
/// </summary>
public sealed class RecipientNotificationSmsService : IRecipientNotificationSmsService
{
    private readonly ISmsService _smsService;
    private readonly ILogger<RecipientNotificationSmsService> _logger;
    private readonly bool _enabled;

    public RecipientNotificationSmsService(
        ISmsService smsService,
        ILogger<RecipientNotificationSmsService> logger,
        IConfiguration configuration)
    {
        _smsService = smsService;
        _logger     = logger;
        // Recipient SMS notifications are off by default. To turn them on, set
        // "RecipientSms:Enabled" = true (e.g. RecipientSms__Enabled in env vars).
        _enabled    = configuration.GetValue<bool>("RecipientSms:Enabled");
    }

    // ── Courier assigned notification ────────────────────────────────────────

    public async Task SendCourierAssignedNotificationAsync(
        string recipientPhone,
        string trackingNumber,
        string senderBusinessName,
        CancellationToken cancellationToken = default)
    {
        if (!_enabled)
        {
            _logger.LogInformation(
                "Recipient notification SMS disabled — skipped for order {TrackingNumber}. " +
                "Set RecipientSms:Enabled=true to turn it on.",
                trackingNumber);
            return;
        }

        if (string.IsNullOrWhiteSpace(recipientPhone))
        {
            _logger.LogWarning(
                "Courier assigned SMS skipped for tracking {TrackingNumber}: recipient has no phone number.",
                trackingNumber);
            return;
        }

        var message = FormatCourierAssignedMessage(trackingNumber, senderBusinessName);

        var result = await _smsService.SendSmsAsync(
            recipientPhone,
            message,
            cancellationToken);

        if (result.IsSuccess)
        {
            _logger.LogInformation(
                "Recipient notification SMS sent to {Phone} for order {TrackingNumber}. SmsId={SmsId}",
                recipientPhone, trackingNumber, result.Value);
        }
        else
        {
            // Log and continue — a failed SMS must never break the courier assignment flow.
            _logger.LogError(
                "Failed to send recipient notification SMS to {Phone} for order {TrackingNumber}: {Error}",
                recipientPhone, trackingNumber, result.Error);
        }
    }

    // ── Message formatter ────────────────────────────────────────────────────

    private static string FormatCourierAssignedMessage(string trackingNumber, string senderBusinessName) =>
        $"📦 DILO: თქვენი ამანათი 1-3 დღეში ჩაგბარდებათ.\n" +
        $"თრექინგი: {trackingNumber}\n" +
        $"გამგზავნი: {senderBusinessName}\n" +
        $"dilo.ge/track/{trackingNumber}";
}
