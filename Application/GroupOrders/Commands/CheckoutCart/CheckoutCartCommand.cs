using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Commands.CheckoutCart;

/// <summary>
/// Places the packages a customer accumulated in their cart.
///
/// Placement rule (decided with the product owner):
///   • exactly one package  → created standalone (GroupOrderId = null), owned by the
///     customer directly. An admin later links it to that customer's same-day batch.
///   • two or more packages → grouped into a single new GroupOrder, as before.
///
/// Reuses <see cref="CreateGroupOrderDto"/> for its identical shape (sender + pickup +
/// orders + customer). Distinct from CreateGroupOrderCommand, which the partner API
/// still uses with its always-create-a-batch (returns split out) semantics.
/// </summary>
public sealed record CheckoutCartCommand(
    CreateGroupOrderDto Dto
) : IRequest<CreateGroupOrderResultDto>;
