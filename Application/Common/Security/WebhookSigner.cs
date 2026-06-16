using System.Security.Cryptography;
using System.Text;

namespace Application.Common.Security;

/// <summary>
/// Generates webhook signing secrets and computes the HMAC-SHA256 signature a
/// partner uses to verify a delivery genuinely came from us. The partner recomputes
/// <c>HMAC-SHA256(secret, rawBody)</c> and compares it to the <c>X-Webhook-Signature</c> header.
/// </summary>
public static class WebhookSigner
{
    public const string SecretPrefix = "whsec_";
    public const string SignaturePrefix = "sha256=";

    /// <summary>Creates a new high-entropy shared secret to give to the partner.</summary>
    public static string GenerateSecret()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        var token = Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
        return SecretPrefix + token;
    }

    /// <summary>Returns the signature header value (<c>sha256=&lt;hex&gt;</c>) for a payload.</summary>
    public static string Sign(string secret, string payload)
    {
        var hash = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret),
            Encoding.UTF8.GetBytes(payload));
        return SignaturePrefix + Convert.ToHexStringLower(hash);
    }
}
