using Application.Common.Interfaces;
using Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Sms;

/// <summary>
/// Sends admin-facing SMS alerts for DILO delivery events.
/// Looks up all ApplicationUsers with Role == "Admin" that have a PhoneNumber set.
/// </summary>
public sealed class AdminNotificationSmsService : IAdminNotificationSmsService
{
    private readonly ISmsService _smsService;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<AdminNotificationSmsService> _logger;

    public AdminNotificationSmsService(
        ISmsService smsService,
        UserManager<ApplicationUser> userManager,
        ILogger<AdminNotificationSmsService> logger)
    {
        _smsService   = smsService;
        _userManager  = userManager;
        _logger       = logger;
    }

    // ── New GroupOrder notification ──────────────────────────────────────────

    public async Task SendNewGroupOrderNotificationAsync(
        GroupOrder groupOrder,
        CancellationToken cancellationToken = default)
    {
        var admins = await _userManager.GetUsersInRoleAsync("Admin");

        var adminPhonesWithNumbers = admins
            .Where(a => !string.IsNullOrWhiteSpace(a.PhoneNumber))
            .ToList();

        if (adminPhonesWithNumbers.Count == 0)
        {
            _logger.LogWarning(
                "New GroupOrder {GroupOrderId} created but no admin has a phone number configured. " +
                "Set PhoneNumber on the admin ApplicationUser to enable SMS alerts.",
                groupOrder.Id);
            return;
        }

        var message = FormatNewGroupOrderMessage(groupOrder);

        foreach (var admin in adminPhonesWithNumbers)
        {
            var result = await _smsService.SendSmsAsync(
                admin.PhoneNumber!,
                message,
                cancellationToken);

            if (result.IsSuccess)
            {
                _logger.LogInformation(
                    "Admin notification SMS sent to {Phone} for GroupOrder {GroupOrderId}. SmsId={SmsId}",
                    admin.PhoneNumber, groupOrder.Id, result.Value);
            }
            else
            {
                // Log and continue — a failed SMS must never break the order creation flow.
                _logger.LogError(
                    "Failed to send admin notification SMS to {Phone} for GroupOrder {GroupOrderId}: {Error}",
                    admin.PhoneNumber, groupOrder.Id, result.Error);
            }
        }
    }

    // ── Message formatter ────────────────────────────────────────────────────

    private static string FormatNewGroupOrderMessage(GroupOrder groupOrder)
    {
        // Georgian message — concise enough for a single SMS (< 160 chars)
        return $"📦 ახალი შეკვეთა \n" +
               $"გამგზავნი: {groupOrder.SenderBusinessName}\n" +
               $"ტელ: {groupOrder.SenderPhone}";
    }
}
