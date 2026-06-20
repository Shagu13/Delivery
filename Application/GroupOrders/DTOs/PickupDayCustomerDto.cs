namespace Application.GroupOrders.DTOs;

/// <summary>
/// Per-customer pickup summary for a single day, for the admin Pick-Up page.
/// </summary>
public sealed record PickupDayCustomerDto(
    Guid   CustomerId,
    string BusinessName,
    /// <summary>All non-cancelled orders the customer placed that day (grouped + standalone).</summary>
    int    OrdersPlaced,
    /// <summary>Of those, how many are still unattached (no group order yet).</summary>
    int    UnattachedOrders
);
