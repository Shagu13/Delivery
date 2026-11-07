namespace API.Models.AdminAccounts;

/// <summary>HTTP request body for PUT /api/adminaccounts/{id}/password (system admin only).</summary>
public sealed record ResetAdminPasswordRequest(
    string NewPassword,
    string ConfirmNewPassword
);
