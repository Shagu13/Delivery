using System.Security.Cryptography;

namespace Application.Common.Security;

/// <summary>
/// Generates and hashes partner API keys.
///
/// Keys are 256-bit cryptographically-random tokens, so a fast one-way hash
/// (SHA-256) is sufficient — unlike low-entropy passwords, they need no salt or
/// slow KDF. Only the hash is persisted; the raw key is shown to the admin once.
/// </summary>
public static class ApiKeyHasher
{
    public const string Prefix = "pk_";

    /// <summary>
    /// Creates a new random key. Returns the raw key (give to the partner once)
    /// and a short clear-text prefix (safe to store/display for identification).
    /// </summary>
    public static (string RawKey, string KeyPrefix) Generate()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);

        // URL-safe Base64 without padding so the key is a clean single token.
        var token  = Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
        var rawKey = Prefix + token;

        // First 11 chars (pk_ + 8) are enough to recognise a key without revealing it.
        var keyPrefix = rawKey[..Math.Min(11, rawKey.Length)];
        return (rawKey, keyPrefix);
    }

    /// <summary>Computes the lowercase hex SHA-256 hash used to look a key up.</summary>
    public static string Hash(string rawKey)
    {
        var hash = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(rawKey));
        return Convert.ToHexStringLower(hash);
    }
}
