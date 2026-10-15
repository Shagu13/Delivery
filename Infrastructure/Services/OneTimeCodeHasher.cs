using System.Security.Cryptography;
using System.Text;
using Application.Common.Interfaces;
using Microsoft.Extensions.Options;

namespace Infrastructure.Services;

/// <summary>
/// HMAC-SHA256 keyed with a key derived from the JWT secret (domain-separated, so the raw
/// signing key is never used directly for anything but signing).
/// </summary>
public sealed class OneTimeCodeHasher : IOneTimeCodeHasher
{
    private readonly byte[] _key;

    public OneTimeCodeHasher(IOptions<JwtSettings> jwt)
    {
        _key = SHA256.HashData(Encoding.UTF8.GetBytes("one-time-code:" + jwt.Value.Secret));
    }

    public string Hash(string context, string value) =>
        Convert.ToHexString(HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes(context + ":" + value)));
}
