using MediatR;

namespace Application.Orders.Commands;

/// <summary>
/// A customer cancels one of their own packages — Send, Exchange, or Return
/// (batch or standalone). Allowed per-package only until a courier has physically
/// picked the parcel up (see <see cref="CustomerOrderActionPolicy"/>). The order →
/// CancelledBySender.
/// </summary>
public sealed record CancelOrderByCustomerCommand(
    Guid OrderId,
    Guid CustomerId
) : IRequest;
