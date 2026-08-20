using MediatR;

namespace Application.Orders.Commands;

/// <summary>
/// A customer edits a limited set of fields on one of their own Send/Exchange
/// packages. Allowed only while the parent group order is still Pending (the same
/// window in which the customer can cancel). Standalone Return orders are out of scope.
/// </summary>
public sealed record UpdateOrderByCustomerCommand(
    Guid     OrderId,
    Guid     CustomerId,
    string   RecipientName,
    string   RecipientPhone,
    string   RecipientAddress,
    decimal? AmountToCollectForPackage,
    string?  Description
) : IRequest;
