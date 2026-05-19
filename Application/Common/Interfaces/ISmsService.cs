namespace Application.Common.Interfaces;

/// <summary>
/// Low-level SMS gateway — sends a raw message to a phone number.
/// BrandId and ApiKey are resolved internally from configuration.
/// </summary>
public interface ISmsService
{
    /// <summary>
    /// Sends an SMS to the given phone number.
    /// Phone number should include country code (e.g. 995599123456).
    /// Returns the gateway SMS ID on success.
    /// </summary>
    Task<SmsResult> SendSmsAsync(
        string phoneNumber,
        string message,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns the current SMS credit balance on the UBill account.
    /// </summary>
    Task<SmsResult> GetSmsBalanceAsync(
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Lightweight result wrapper used by the SMS layer so it does not
/// depend on the Application-wide Result&lt;T&gt; type.
/// </summary>
public sealed class SmsResult
{
    public bool   IsSuccess  { get; private init; }
    public string? Value     { get; private init; }   // SMS ID or balance string
    public string? Error     { get; private init; }
    public int    StatusCode { get; private init; }

    public static SmsResult Success(string value) =>
        new() { IsSuccess = true, Value = value, StatusCode = 200 };

    public static SmsResult Failure(string error, int statusCode = 500) =>
        new() { IsSuccess = false, Error = error, StatusCode = statusCode };
}
