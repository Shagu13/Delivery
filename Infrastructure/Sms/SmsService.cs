using Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace Infrastructure.Sms;

/// <summary>
/// Concrete SMS gateway using the UBill API.
/// Reads ApiKey and BrandId from configuration — DILO is a single-tenant app
/// so there is no per-business brand ID.
///
/// Config keys expected in appsettings.json:
///   "UBill:ApiKey"  — shared secret
///   "UBill:BrandId" — integer brand identifier
/// </summary>
public sealed class SmsService : ISmsService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<SmsService> _logger;
    private readonly string _apiKey;
    private readonly int    _brandId;
    private const string BaseUrl = "https://api.ubill.dev/v1/sms";

    public SmsService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<SmsService> logger)
    {
        _httpClient = httpClient;
        _logger     = logger;

        _apiKey = configuration["UBill:ApiKey"]
            ?? throw new InvalidOperationException("UBill:ApiKey is not configured.");

        var brandIdRaw = configuration["UBill:BrandId"]
            ?? throw new InvalidOperationException("UBill:BrandId is not configured.");

        if (!int.TryParse(brandIdRaw, out _brandId) || _brandId <= 0)
            throw new InvalidOperationException($"UBill:BrandId must be a positive integer. Got: '{brandIdRaw}'");
    }

    // ── Send SMS ─────────────────────────────────────────────────────────────

    public async Task<SmsResult> SendSmsAsync(
        string phoneNumber,
        string message,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(phoneNumber))
            return SmsResult.Failure("Phone number is required.", 400);

        if (string.IsNullOrWhiteSpace(message))
            return SmsResult.Failure("Message text is required.", 400);

        // Ensure Georgian country code is present
        var phone = phoneNumber.Trim();
        if (!phone.StartsWith("995"))
            phone = "995" + phone;

        var url = $"{BaseUrl}/send?key={_apiKey}&brandID={_brandId}" +
                  $"&numbers={phone}&text={Uri.EscapeDataString(message)}";

        try
        {
            _logger.LogInformation(
                "Sending SMS via UBill to {Phone} (brandId={BrandId})", phone, _brandId);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            var content  = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                var smsId = ExtractSmsId(content);
                _logger.LogInformation("SMS sent. UBill smsId={SmsId}", smsId);
                return SmsResult.Success(smsId);
            }

            _logger.LogError(
                "UBill send failed. Status={Status} Body={Body}",
                response.StatusCode, content);

            return SmsResult.Failure(
                $"UBill API error: {response.StatusCode}", (int)response.StatusCode);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Network error while sending SMS to {Phone}", phone);
            return SmsResult.Failure($"Network error: {ex.Message}", 500);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while sending SMS to {Phone}", phone);
            return SmsResult.Failure($"SMS service error: {ex.Message}", 500);
        }
    }

    // ── Balance ──────────────────────────────────────────────────────────────

    public async Task<SmsResult> GetSmsBalanceAsync(
        CancellationToken cancellationToken = default)
    {
        var url = $"{BaseUrl}/balance?key={_apiKey}";

        try
        {
            var response = await _httpClient.GetAsync(url, cancellationToken);
            var content  = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError(
                    "UBill balance check failed. Status={Status} Body={Body}",
                    response.StatusCode, content);
                return SmsResult.Failure(
                    $"Balance check failed: {response.StatusCode}", (int)response.StatusCode);
            }

            using var doc  = JsonDocument.Parse(content);
            var root = doc.RootElement;

            // UBill returns statusID = 0 on success
            if (root.TryGetProperty("statusID", out var statusEl) && statusEl.GetInt32() != 0)
                return SmsResult.Failure($"UBill error statusID: {statusEl.GetInt32()}", 400);

            if (root.TryGetProperty("sms", out var smsEl))
            {
                var balance = smsEl.ValueKind == JsonValueKind.Number
                    ? smsEl.GetInt32().ToString()
                    : smsEl.GetString() ?? "0";

                _logger.LogInformation("UBill SMS balance: {Balance}", balance);
                return SmsResult.Success(balance);
            }

            return SmsResult.Failure("Could not parse SMS balance from UBill response.", 500);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching SMS balance from UBill");
            return SmsResult.Failure($"Balance check error: {ex.Message}", 500);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static string ExtractSmsId(string responseContent)
    {
        try
        {
            using var doc = JsonDocument.Parse(responseContent);

            if (doc.RootElement.TryGetProperty("smsId", out var el1))
                return el1.GetString() ?? responseContent;

            if (doc.RootElement.TryGetProperty("id", out var el2))
                return el2.GetString() ?? responseContent;
        }
        catch
        {
            // Response may be plain-text SMS ID — fall through
        }

        return responseContent.Trim();
    }
}
