using Domain.Enums;

namespace Application.GroupOrders.DTOs;

/// <summary>
/// Input DTO for a single package within a GroupOrder creation.
/// One of these becomes one Order row with its own tracking number.
/// </summary>
public sealed record CreateOrderDto(
    string RecipientFirstName,
    string RecipientLastName,
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
    double?        Longitude                 = null
);
