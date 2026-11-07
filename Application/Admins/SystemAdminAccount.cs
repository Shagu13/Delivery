namespace Application.Admins;

/// <summary>
/// The dedicated system-admin account (seeded in Persistence). It owns the
/// <c>SystemAdmin</c> policy and is never a target of the admin-password reset.
/// </summary>
public static class SystemAdminAccount
{
    public const string UserName = "systemadmin";

    public static bool IsSystemAdmin(string? userName) =>
        string.Equals(userName, UserName, StringComparison.OrdinalIgnoreCase);
}
