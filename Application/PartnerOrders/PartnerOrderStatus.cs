using Domain.Enums;

namespace Application.PartnerOrders;

/// <summary>
/// Stable, coarse-grained delivery status exposed to business partners. Decoupled
/// from the internal <see cref="OrderStatus"/> so internal workflow changes don't
/// break a partner's integration. The numeric value is the public status code
/// (onway-style); the name is the public label.
/// </summary>
public enum PartnerOrderStatus
{
    Created          = 1,
    Accepted         = 2,
    PickupInProgress = 3,
    AtWarehouse      = 4,
    InTransit        = 5,
    OutForDelivery   = 6,
    Delivered        = 7,
    Postponed        = 8,
    Cancelled        = 9,
    Returned         = 10,
}

public static class PartnerOrderStatusMapper
{
    /// <summary>Collapses an internal status into the public partner status.</summary>
    public static PartnerOrderStatus Map(OrderStatus status) => status switch
    {
        OrderStatus.Pending                              => PartnerOrderStatus.Created,

        OrderStatus.AcceptedGroupOrder                   => PartnerOrderStatus.Accepted,
        OrderStatus.AcceptedOrder                        => PartnerOrderStatus.Accepted,

        OrderStatus.CourierAssignedToPickUp             => PartnerOrderStatus.PickupInProgress,
        OrderStatus.CourierDeliveringToWarehouse        => PartnerOrderStatus.PickupInProgress,

        OrderStatus.DeliveredToWarehouse                 => PartnerOrderStatus.AtWarehouse,
        OrderStatus.AdminAcceptedOrderInWareHouse        => PartnerOrderStatus.AtWarehouse,

        OrderStatus.OrderIsOnItsWayToRecipientsCity      => PartnerOrderStatus.InTransit,

        OrderStatus.CourierAssignedToDeliver             => PartnerOrderStatus.OutForDelivery,
        OrderStatus.CourierDeliveringTheOrderToRecipient => PartnerOrderStatus.OutForDelivery,

        OrderStatus.DeliveredToRecipient                 => PartnerOrderStatus.Delivered,
        OrderStatus.AllDelivered                         => PartnerOrderStatus.Delivered,
        OrderStatus.ExchangeCompleted                    => PartnerOrderStatus.Delivered,

        OrderStatus.DeliveryPostponed                    => PartnerOrderStatus.Postponed,

        OrderStatus.OrderNotAccepted                     => PartnerOrderStatus.Cancelled,
        OrderStatus.CancelledBySender                    => PartnerOrderStatus.Cancelled,
        OrderStatus.CancelledByAdmin                     => PartnerOrderStatus.Cancelled,

        OrderStatus.PickedUpFromRecipient                => PartnerOrderStatus.Returned,
        OrderStatus.DeliveredReturnOrderToWarehouse      => PartnerOrderStatus.Returned,
        OrderStatus.ReturnedToSender                     => PartnerOrderStatus.Returned,

        _                                                => PartnerOrderStatus.Created,
    };

    /// <summary>Maps a raw status string (e.g. a TrackingEvent.Status) to a public status; null if unrecognised.</summary>
    public static PartnerOrderStatus? TryMap(string? raw) =>
        Enum.TryParse<OrderStatus>(raw, ignoreCase: true, out var s) ? Map(s) : null;

    /// <summary>The internal statuses that map to a given public status — used to filter queries.</summary>
    public static OrderStatus[] ToInternal(PartnerOrderStatus status) => status switch
    {
        PartnerOrderStatus.Created          => [OrderStatus.Pending],
        PartnerOrderStatus.Accepted         => [OrderStatus.AcceptedGroupOrder, OrderStatus.AcceptedOrder],
        PartnerOrderStatus.PickupInProgress => [OrderStatus.CourierAssignedToPickUp, OrderStatus.CourierDeliveringToWarehouse],
        PartnerOrderStatus.AtWarehouse      => [OrderStatus.DeliveredToWarehouse, OrderStatus.AdminAcceptedOrderInWareHouse],
        PartnerOrderStatus.InTransit        => [OrderStatus.OrderIsOnItsWayToRecipientsCity],
        PartnerOrderStatus.OutForDelivery   => [OrderStatus.CourierAssignedToDeliver, OrderStatus.CourierDeliveringTheOrderToRecipient],
        PartnerOrderStatus.Delivered        => [OrderStatus.DeliveredToRecipient, OrderStatus.AllDelivered, OrderStatus.ExchangeCompleted],
        PartnerOrderStatus.Postponed        => [OrderStatus.DeliveryPostponed],
        PartnerOrderStatus.Cancelled        => [OrderStatus.OrderNotAccepted, OrderStatus.CancelledBySender, OrderStatus.CancelledByAdmin],
        PartnerOrderStatus.Returned         => [OrderStatus.PickedUpFromRecipient, OrderStatus.DeliveredReturnOrderToWarehouse, OrderStatus.ReturnedToSender],
        _                                   => [],
    };
}
