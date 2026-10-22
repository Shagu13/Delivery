using Application.Orders.Queries.GetAllOrders;

namespace Application.Couriers.Queries.CompletedByCourier;

/// <summary>
/// One order a courier completed on the last-mile leg. <see cref="Order"/> is the same shape the Delivery
/// list returns, so the admin order view modal opens it unchanged.
/// </summary>
/// <param name="CompletedAt">When the courier finished it: delivery time, the failed-attempt time for a
/// billable failed delivery, or the warehouse drop-off time for a standalone Return.</param>
/// <param name="IsFailed">A billable failed delivery — the courier did not hand it over but the sender is still charged.</param>
/// <param name="FailureReason"><c>CancellationReason</c> name; set only when <see cref="IsFailed"/>.</param>
public sealed record CompletedDeliveryDto(
    AdminOrderListDto Order,
    DateTime          CompletedAt,
    bool              IsFailed,
    string?           FailureReason,
    string?           FailureComment);

/// <summary>One pickup batch (GroupOrder) a courier brought to the warehouse.</summary>
public sealed record CompletedPickupDto(
    Guid      Id,
    Guid      CourierId,
    string    CourierFullName,
    string    SenderBusinessName,
    string    SenderPhone,
    string    PickUpCity,
    string    PickUpDistrict,
    string    PickUpAddress,
    int       NumberOfPackages,
    string    Status,
    DateTime? PickedUpAt,
    DateTime  DeliveredToWarehouseAt);
