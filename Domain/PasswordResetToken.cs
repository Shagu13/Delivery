namespace Domain;

/// <summary>
/// Stores a short one-time code that maps to an ASP.NET Identity password-reset token.
/// The full Identity token never leaves the server — only the short Code is sent in the SMS.
/// </summary>
public class PasswordResetToken
{
    public Guid   Id             { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Short alphanumeric code sent in the SMS link (e.g. "A3K9PQ2X1B").
    /// 10 uppercase hex chars → ~1 trillion combinations, safe against brute force.
    /// </summary>
    public required string Code           { get; set; }

    /// <summary>The ApplicationUser.Id this token belongs to.</summary>
    public required string UserId         { get; set; }

    /// <summary>
    /// The raw ASP.NET Identity password-reset token — stored server-side,
    /// never exposed in URLs or SMS messages.
    /// </summary>
    public required string IdentityToken  { get; set; }

    public DateTime ExpiresAt  { get; set; }
    public bool     IsUsed     { get; set; } = false;
    public DateTime CreatedAt  { get; set; } = DateTime.UtcNow;
}
