namespace Infrastructure.Services;

public sealed class JwtSettings
{
    public const string SectionName = "JwtSettings";

    public required string Secret { get; init; }
    public required string Issuer { get; init; }
    public required string Audience { get; init; }
    public int ExpiryMinutes { get; init; } = 480;
}
