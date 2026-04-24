namespace Application.GroupOrders.DTOs;

public sealed record CreateGroupOrderDto(
    string SenderFirstName,
    string SenderLastName,
    string? SenderIdNumber,
    string SenderBusinessName,
    string SenderPhone,
    string PickUpCity,
    string PickUpDistrict,
    string PickUpAddress,
    string? Note,
    IReadOnlyList<CreateOrderDto> Orders,
    Guid? CustomerId = null   // ← set when a logged-in customer places the order
);
