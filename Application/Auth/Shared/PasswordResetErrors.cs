using Application.Common.Exceptions;
using FluentValidation.Results;

namespace Application.Auth.Shared;

/// <summary>
/// User-facing failures of the SMS-code reset flow. The failure's property name is a stable
/// code the client maps to a translated message; the text is the English fallback.
/// Surfaces as HTTP 422 through <c>ExceptionHandlingMiddleware</c>.
/// </summary>
public static class PasswordResetErrors
{
    public const string AccountNotFound = nameof(AccountNotFound);
    public const string ResendTooSoon   = nameof(ResendTooSoon);
    public const string TooManyRequests = nameof(TooManyRequests);
    public const string SmsFailed       = nameof(SmsFailed);
    public const string SmsInvalidPhone = nameof(SmsInvalidPhone);
    public const string CodeWrong       = nameof(CodeWrong);
    public const string CodeExpired     = nameof(CodeExpired);
    public const string TooManyAttempts = nameof(TooManyAttempts);
    public const string TicketInvalid   = nameof(TicketInvalid);

    public static ValidationException Fail(string code, string message) =>
        new(new[] { new ValidationFailure(code, message) });
}
