using Domain.Enums;

namespace Application.GroupOrders.DTOs;

/// <summary>
/// Input DTO for a single package within a GroupOrder creation.
/// One of these becomes one Order row with its own tracking number.
/// </summary>
public sealed record CreateOrderDto(
    string RecipientName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    string?        Description,
    bool           IsFragile,
    PaymentStatus  ProductPaymentStatus,
    ServicePayer   WhoPaysForCompanyService,
    OrderType      OrderType                 = OrderType.Send,   // ← new
    string?        ReturnPickupAddress       = null,             // ← new: required when OrderType == Return
    string?        ReturnPickupCity          = null,             // ← new
    string?        ReturnPickupDistrict      = null,             // ← new
    decimal?       AmountToCollectForPackage = null,
    decimal?       CompanyServicePrice       = null,
    Guid?          WeightPriceTierId         = null,
    double?        Latitude                  = null,   // from geocoded address pick
    double?        Longitude                 = null,
    /// <summary>
    /// True when AmountToCollectForPackage is the all-in price (product + service fee).
    /// The resolved service fee is subtracted so only the product portion is stored as COD.
    /// </summary>
    bool           IsCompanyServicePriceIncluded = false,
    /// <summary>
    /// The partner's own order number when this order is placed through the partner API.
    /// Stored on the Order for de-duplication and reconciliation. Null for web/admin orders.
    /// </summary>
    string?        ExternalReference             = null
);
