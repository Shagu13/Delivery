namespace Application.CustomerSettlements.DTOs;

/// <summary>
/// Admin-facing preview for a customer + month. Shows the figures computed live
/// from the customer's current orders, plus the already-saved settlement row (if
/// one exists) so the admin can compare and decide whether to create / recompute.
/// </summary>
public sealed record CustomerSettlementPreviewDto(
    Guid    CustomerId,
    string  CustomerBusinessName,
    int     Year,
    int     Month,

    // ── Live figures computed from orders right now ──────────────────────────
    int     OrdersPlaced,
    int     OrdersDelivered,
    decimal CodCollectedForPackages,
    decimal CompanyServicePriceOwed,

    // ── The saved settlement for this month, or null if none exists yet ──────
    CustomerSettlementDto? ExistingSettlement
);
