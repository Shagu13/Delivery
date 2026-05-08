using Domain.Enums;

namespace API.Models.GroupOrders;

public sealed record CreateGroupOrderRequest(
    string SenderFirstName,
    string SenderLastName,
    string? SenderIdNumber,
    string SenderBusinessName,
    string SenderPhone,
    string PickUpCity,
    string PickUpDistrict,
    string PickUpAddress,
    string? Note,
    IReadOnlyList<OrderItemRequest> Orders
// CustomerId intentionally removed — resolved server-side from JWT claims
);

public sealed record OrderItemRequest(
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    string? Description,
    bool IsFragile = false,
    PaymentStatus ProductPaymentStatus = PaymentStatus.NotPaid,
    ServicePayer WhoPaysForCompanyService = ServicePayer.Sender,
    /// <summary>
    /// True when the customer selected City == District in the form (e.g. City=Tbilisi, District=Tbilisi),
    /// indicating the delivery is within the city itself. RecipientDistrict will then hold the
    /// actual sub-district chosen in the third picker.
    /// </summary>
    bool IsDeliveryAddressInCityItself = false,
    decimal? CompanyServicePrice = null
);
