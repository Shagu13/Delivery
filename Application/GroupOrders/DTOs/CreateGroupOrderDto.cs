namespace Application.GroupOrders.DTOs;

public sealed record CreateGroupOrderDto(
    string SenderFirstName,
    string SenderLastName,
    string? SenderIdNumber,
    string SenderBusinessName,
    string SenderPhone,
    string? AlternativeSenderPhone,
    string PickUpCity,
    string PickUpDistrict,
    string PickUpAddress,
    string? Note,
    IReadOnlyList<CreateOrderDto> Orders,
    Guid? CustomerId = null,   // ← set when a logged-in customer places the order
    /// <summary>
    /// Opt-in: when true and a logged-in customer already has an open batch from today
    /// (same pickup + sender, not yet picked up by a courier), the new Send/Exchange
    /// packages are merged into that batch instead of creating a new GroupOrder. Set by
    /// the web customer flow; left false by the partner API so partner orders never merge.
    /// </summary>
    bool MergeIntoOpenBatch = false
);
