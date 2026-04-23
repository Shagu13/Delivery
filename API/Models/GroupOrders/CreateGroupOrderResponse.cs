namespace API.Models.GroupOrders;

/// <summary>
/// HTTP response body for POST /api/grouporders.
/// What the sender's browser receives after submitting the form.
/// Separated from CreateGroupOrderResult (Application layer) so the API
/// contract can evolve independently of internal handler logic.
/// </summary>
public sealed record CreateGroupOrderResponse(
    Guid GroupOrderId,
    string SenderBusinessName,
    IReadOnlyList<OrderTrackingResponse> Orders
);

/// <summary>
/// One entry per package — sender receives these tracking numbers
/// to share with each recipient.
/// </summary>
public sealed record OrderTrackingResponse(
    Guid OrderId,
    string TrackingNumber,
    string RecipientFirstName,
    string RecipientLastName
);
