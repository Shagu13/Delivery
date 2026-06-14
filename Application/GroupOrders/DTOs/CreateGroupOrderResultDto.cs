namespace Application.GroupOrders.DTOs;

/// <summary>
/// Output DTO returned immediately after a GroupOrder is created.
/// Contains the GroupOrder ID and each package's tracking number
/// so the sender can share TNs with recipients right away.
/// </summary>
public sealed record CreateGroupOrderResultDto(
    Guid GroupOrderId,
    string SenderBusinessName,
    IReadOnlyList<CreatedOrderDto> Orders
);

/// <summary>Per-package result after creation — the TN is what recipients use to track.</summary>
public sealed record CreatedOrderDto(
    Guid OrderId,
    string TrackingNumber,
    string RecipientName
);
