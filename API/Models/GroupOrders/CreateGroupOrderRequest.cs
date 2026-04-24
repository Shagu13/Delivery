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
    IReadOnlyList<OrderItemRequest> Orders,
    Guid? CustomerId = null   // ← frontend sends this when customer is logged in
);

public sealed record OrderItemRequest(
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    string? Description
);
