using Domain.Enums;

namespace API.Models.Partner;

/// <summary>
/// A shipment pushed by a business partner through the partner API. Sender/pickup
/// fields are optional — when omitted they fall back to the partner's own Customer
/// profile. Each item in <see cref="Orders"/> becomes one Order with its own
/// tracking number. Only standard Send deliveries are supported in this version.
/// </summary>
public sealed record PartnerOrderRequest(
    IReadOnlyList<PartnerOrderItemRequest> Orders,
    string? SenderFirstName    = null,
    string? SenderLastName     = null,
    string? SenderIdNumber     = null,
    string? SenderBusinessName = null,
    string? SenderPhone        = null,
    string? PickUpCity         = null,
    string? PickUpDistrict     = null,
    string? PickUpAddress      = null,
    string? Note               = null
);

public sealed record PartnerOrderItemRequest(
    string RecipientName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    string? Description = null,
    bool IsFragile = false,
    /// <summary>Paid (prepaid) or NotPaid (cash-on-delivery). Default NotPaid.</summary>
    PaymentStatus ProductPaymentStatus = PaymentStatus.NotPaid,
    /// <summary>Who pays your delivery fee: Sender (invoiced to partner) or Recipient (collected as cash). Default Sender.</summary>
    ServicePayer WhoPaysForCompanyService = ServicePayer.Sender,
    /// <summary>COD amount to collect from the recipient for the product (when NotPaid).</summary>
    decimal? AmountToCollectForPackage = null,
    /// <summary>Optional explicit delivery-fee override; when null the partner's negotiated/district rate is used.</summary>
    decimal? CompanyServicePrice = null,
    /// <summary>The partner's own order number — used for de-duplication and reconciliation.</summary>
    string? ExternalReference = null
);

public sealed record PartnerOrderResponse(
    Guid GroupOrderId,
    IReadOnlyList<PartnerOrderResultItem> Orders
);

public sealed record PartnerOrderResultItem(
    string TrackingNumber,
    string? ExternalReference,
    string RecipientName
);
