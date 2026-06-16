using Domain.Enums;

namespace Application.PartnerOrders.DTOs;

/// <summary>One order as seen by the partner who placed it. No internal financials
/// (courier salary, company revenue) are ever exposed.</summary>
public sealed record PartnerOrderSummaryDto(
    string TrackingNumber,
    string? ExternalReference,
    PartnerOrderStatus Status,
    int StatusCode,
    string RecipientName,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    PaymentStatus ProductPaymentStatus,
    ServicePayer WhoPaysForCompanyService,
    decimal? AmountToCollectForPackage,
    decimal CompanyServicePrice,
    DateTime CreatedAt,
    DateTime? DeliveredAt
);

/// <summary>Detailed single-order view, including the status timeline.</summary>
public sealed record PartnerOrderDetailDto(
    string TrackingNumber,
    string? ExternalReference,
    PartnerOrderStatus Status,
    int StatusCode,
    string RecipientName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    bool IsFragile,
    string? Description,
    PaymentStatus ProductPaymentStatus,
    ServicePayer WhoPaysForCompanyService,
    decimal? AmountToCollectForPackage,
    decimal CompanyServicePrice,
    DateTime CreatedAt,
    DateTime? DeliveredAt,
    IReadOnlyList<PartnerTrackingEventDto> TrackingEvents
);

public sealed record PartnerTrackingEventDto(
    PartnerOrderStatus? Status,
    string Description,
    DateTime Timestamp
);

/// <summary>Paged result wrapper for the partner order list.</summary>
public sealed record PartnerOrderListDto(
    int Total,
    int Page,
    int PageSize,
    IReadOnlyList<PartnerOrderSummaryDto> Items
);
