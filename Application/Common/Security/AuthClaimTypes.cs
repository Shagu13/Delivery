namespace Application.Common.Security;

/// <summary>
/// Custom JWT claim names shared by the token issuer (Infrastructure) and the
/// token validation hook (API), so the two can never drift apart.
/// </summary>
public static class AuthClaimTypes
{
    /// <summary>
    /// The user's Identity <c>SecurityStamp</c> at the moment the token was issued.
    /// Identity rotates the stamp on every password reset, so a token whose stamp no
    /// longer matches the database was issued before the reset and must be rejected.
    /// </summary>
    public const string SecurityStamp = "sstamp";

    /// <summary>
    /// Version of the session rules the token was issued under. Operator tokens must carry
    /// <see cref="CurrentSessionVersion"/>; bumping the constant signs every Operator out on
    /// the next deploy (tokens issued earlier carry an older value, or none).
    /// </summary>
    public const string SessionVersion = "sver";

    public const string CurrentSessionVersion = "1";
}
