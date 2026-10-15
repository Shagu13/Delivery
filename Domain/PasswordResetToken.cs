namespace Domain;

/// <summary>
/// One password-reset attempt, driven by a 6-digit SMS code.
/// Step 1 (request): a code is generated and only its HMAC is stored in <see cref="CodeHash"/>.
/// Step 2 (verify):  the right code is swapped for a single-use ticket, stored hashed in
///                   <see cref="TicketHash"/>; the ticket (not the code) authorises the reset.
/// The full ASP.NET Identity token never leaves the server.
/// </summary>
public class PasswordResetToken
{
    public Guid   Id             { get; set; } = Guid.NewGuid();

    /// <summary>The ApplicationUser.Id this token belongs to.</summary>
    public required string UserId         { get; set; }

    /// <summary>HMAC-SHA256 of the 6-digit code (never the code itself). Cleared once verified.</summary>
    public string? CodeHash       { get; set; }

    /// <summary>Wrong-code guesses so far; the code is burned after the allowed maximum.</summary>
    public int      Attempts      { get; set; }

    /// <summary>Hash of the single-use ticket handed out after a correct code. Null until verified.</summary>
    public string? TicketHash     { get; set; }

    /// <summary>When the ticket stops being accepted. Null until verified.</summary>
    public DateTime? TicketExpiresAt { get; set; }

    /// <summary>
    /// The raw ASP.NET Identity password-reset token — stored server-side,
    /// never exposed in URLs or SMS messages.
    /// </summary>
    public required string IdentityToken  { get; set; }

    /// <summary>When the SMS code stops being accepted.</summary>
    public DateTime ExpiresAt  { get; set; }
    public bool     IsUsed     { get; set; } = false;
    public DateTime CreatedAt  { get; set; } = CustomTime.Now;
}
