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
    /// <summary>
    /// True when City == District was chosen in the form (city-centre delivery),
    /// which triggers the Capital / City tier pricing.
    /// False (default) → District tier pricing.
    /// </summary>
    bool           IsDeliveryAddressInCityItself = false,
    decimal?       CompanyServicePrice = null   // explicit override; null = use auto-pricing
);
