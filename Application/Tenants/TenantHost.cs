namespace Application.Tenants;

/// <summary>Host normalization shared across tenant lookups/commands.</summary>
public static class TenantHost
{
    /// <summary>Lower-cases, drops a port and a leading "www." so a host matches the stored value.</summary>
    public static string Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var h = raw.Trim().ToLowerInvariant();
        int colon = h.IndexOf(':');
        if (colon >= 0) h = h[..colon];
        if (h.StartsWith("www.")) h = h[4..];
        return h;
    }
}
