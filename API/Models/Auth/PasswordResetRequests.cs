namespace API.Models.Auth;

/// <summary>Request body for POST /api/auth/forgot-password</summary>
public sealed record ForgotPasswordRequest(string Email, string PhoneNumber);

/// <summary>
/// Request body for POST /api/auth/reset-password.
/// Only the short code from the SMS link is needed — userId and Identity
/// token are resolved server-side and never exposed to the client.
/// </summary>
public sealed record ResetPasswordRequest(
    string Code,
    string NewPassword,
    string ConfirmNewPassword);
