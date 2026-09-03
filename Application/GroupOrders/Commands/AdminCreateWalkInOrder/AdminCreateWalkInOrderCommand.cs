using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Commands.AdminCreateWalkInOrder;

/// <summary>
/// Admin/Operator "Add Package" for an office walk-in customer. Resolves (or creates) the
/// customer, then creates the packages: Send/Exchange into one warehouse-accepted
/// GroupOrder, Return as standalone orders in the normal Return flow.
///
/// Returns <see cref="CreateGroupOrderResultDto"/> (the batch id + created tracking numbers),
/// reusing the shape of the customer/partner create-order paths.
/// </summary>
public sealed record AdminCreateWalkInOrderCommand(
    AdminCreateWalkInOrderDto Dto
) : IRequest<CreateGroupOrderResultDto>;
