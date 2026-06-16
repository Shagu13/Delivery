namespace Application.PartnerWebhooks.DTOs;

/// <summary>
/// A partner webhook subscription. The <see cref="Secret"/> is included so an admin
/// can (re)share it with the partner — it is stored in clear because we must re-sign
/// every delivery with it.
/// </summary>
public sealed record PartnerWebhookDto(
    Guid     Id,
    Guid     CustomerId,
    string   CustomerBusinessName,
    string   Url,
    string   Secret,
    bool     IsActive,
    DateTime CreatedAt
);
