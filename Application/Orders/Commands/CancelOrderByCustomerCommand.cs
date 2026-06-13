using MediatR;

namespace Application.Orders.Commands;

/// <summary>
/// A customer cancels one of their own packages — Send, Exchange, or Return
/// (batch or standalone). Allowed per-package while the order is still in an early
/// status (see <see cref="CustomerOrderActionPolicy"/>): for Send/Exchange that means
/// up until it's handed to a delivery courier; for Returns, up until the courier has
/// physically collected the parcel. The order → CancelledBySender.
/// </summary>
public sealed record CancelOrderByCustomerCommand(
    Guid OrderId,
    Guid CustomerId
) : IRequest;
