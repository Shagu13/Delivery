namespace API.Models.Auth;

/// <summary>Request body for POST /api/auth/forgot-password</summary>
public sealed record ForgotPasswordRequest(string Email, string PhoneNumber);

/// <summary>Request body for POST /api/auth/verify-reset-code</summary>
public sealed record VerifyResetCodeRequest(string Email, string Code);

/// <summary>Response of POST /api/auth/forgot-password — drives the code screen's timers.</summary>
public sealed record ForgotPasswordResponse(int ExpiresInSeconds, int ResendInSeconds);

/// <summary>Response of POST /api/auth/verify-reset-code — the single-use ticket for the final step.</summary>
public sealed record VerifyResetCodeResponse(string Ticket);

/// <summary>
/// Request body for POST /api/auth/reset-password.
/// The ticket comes from verify-reset-code; userId and the Identity token
/// are resolved server-side and never exposed to the client.
/// </summary>
public sealed record ResetPasswordRequest(
    string Ticket,
    string NewPassword,
    string ConfirmNewPassword);
