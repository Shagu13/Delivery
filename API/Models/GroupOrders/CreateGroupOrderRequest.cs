namespace API.Models.GroupOrders;

/// <summary>
/// HTTP request body for POST /api/grouporders.
/// This is what the client (sender's web form) sends over the wire.
/// The controller maps this → CreateGroupOrderCommand before sending to MediatR.
/// Keeping this separate means changing the API contract never forces changes
/// to Application layer logic, and vice versa.
/// </summary>
public sealed record CreateGroupOrderRequest(
    string SenderFirstName,
    string SenderLastName,
    string ?SenderIdNumber,
    string SenderBusinessName,
    string SenderPhone,
    string PickUpCity,
    string PickUpDistrict,
    string PickUpAddress,
    string? Note,
    IReadOnlyList<OrderItemRequest> Orders
);

/// <summary>One package within the group — fills one Order row.</summary>
public sealed record OrderItemRequest(
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    string? Description
);
