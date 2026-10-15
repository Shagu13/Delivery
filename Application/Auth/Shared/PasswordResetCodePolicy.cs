using System.Security.Cryptography;
using Domain;

namespace Application.Auth.Shared;

/// <summary>Result of checking a submitted code against a reset record.</summary>
public enum CodeCheck { Accepted, Wrong, Locked, Expired }

/// <summary>
/// Single home for the SMS-code reset rules (lifetime, attempts, cooldowns, phone matching) so the
/// request, verify and reset handlers cannot drift apart.
/// </summary>
public static class PasswordResetCodePolicy
{
    public const int CodeLifetimeMinutes   = 5;
    public const int TicketLifetimeMinutes = 10;
    public const int MaxAttempts           = 5;
    public const int ResendCooldownSeconds = 60;
    public const int MaxRequestsPerHour    = 5;

    /// <summary>Hash context for reset tickets (codes are bound to the user id instead).</summary>
    public const string TicketContext = "password-reset-ticket";

    /// <summary>Cryptographically random 6-digit code, zero-padded ("004217").</summary>
    public static string NewCode() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    /// <summary>Url-safe random ticket (256 bits).</summary>
    public static string NewTicket() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');

    /// <summary>Lower-cases and trims the email so "Foo@Mail.COM" matches "foo@mail.com".</summary>
    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    /// <summary>Digits only, without the 995 country code: "+995 599 12 34 56" → "599123456".</summary>
    public static string NormalizePhone(string phone)
    {
        string digits = new(phone.Where(char.IsDigit).ToArray());
        return digits.Length > 9 && digits.StartsWith("995") ? digits[3..] : digits;
    }

    public static bool PhonesMatch(string stored, string submitted) =>
        NormalizePhone(stored) == NormalizePhone(submitted);

    /// <summary>
    /// Checks a code attempt. Counts a wrong guess and burns the record once
    /// <see cref="MaxAttempts"/> is reached. On success the code hash is cleared so it can't be replayed.
    /// </summary>
    public static CodeCheck CheckCode(PasswordResetToken record, string submittedHash, DateTime now)
    {
        if (record.IsUsed || record.CodeHash is null || record.Attempts >= MaxAttempts)
            return CodeCheck.Locked;
        if (record.ExpiresAt <= now)
            return CodeCheck.Expired;

        bool match = CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.ASCII.GetBytes(record.CodeHash),
            System.Text.Encoding.ASCII.GetBytes(submittedHash));

        if (!match)
        {
            record.Attempts++;
            if (record.Attempts >= MaxAttempts)
                record.IsUsed = true;
            return CodeCheck.Wrong;
        }

        record.CodeHash = null;
        return CodeCheck.Accepted;
    }
}
