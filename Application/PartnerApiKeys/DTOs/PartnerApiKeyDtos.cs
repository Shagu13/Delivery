namespace Application.PartnerApiKeys.DTOs;

/// <summary>
/// Returned once, immediately after a key is issued. <see cref="ApiKey"/> is the
/// raw secret — it is never retrievable again, so the admin must copy it now.
/// </summary>
public sealed record IssuePartnerApiKeyResultDto(
    Guid   Id,
    Guid   CustomerId,
    string Name,
    string KeyPrefix,
    string ApiKey
);

/// <summary>Listing view of a partner key — never exposes the raw key or its hash.</summary>
public sealed record PartnerApiKeyDto(
    Guid      Id,
    Guid      CustomerId,
    string    CustomerBusinessName,
    string    Name,
    string    KeyPrefix,
    bool      IsActive,
    DateTime  CreatedAt,
    DateTime? LastUsedAt,
    DateTime? RevokedAt
);
