namespace Application.GroupOrders.DTOs;

/// <summary>
/// Input DTO for creating a GroupOrder.
/// Carries sender info, pickup location, and the list of packages.
/// Used by CreateGroupOrderCommand — keeps the command clean and focused.
/// </summary>
public sealed record CreateGroupOrderDto(
    string SenderFirstName,
    string SenderLastName,
    string ?SenderIdNumber,
    string SenderBusinessName,
    string SenderPhone,
    string PickUpCity,
    string PickUpDistrict,
    string PickUpAddress,
    string? Note,
    IReadOnlyList<CreateOrderDto> Orders
);
