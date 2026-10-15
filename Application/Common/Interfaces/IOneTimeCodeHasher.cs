namespace Application.Common.Interfaces;

/// <summary>
/// Keyed one-way hash for short secrets (SMS codes) and reset tickets. A 6-digit code has only
/// a million values, so a plain hash would be reversible from a leaked table — this one is keyed
/// with a server secret.
/// </summary>
public interface IOneTimeCodeHasher
{
    /// <summary>Hex digest of <paramref name="value"/> bound to a <paramref name="context"/> (a user id or a fixed label).</summary>
    string Hash(string context, string value);
}
