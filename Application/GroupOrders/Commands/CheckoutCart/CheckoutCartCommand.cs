using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Commands.CheckoutCart;

/// <summary>
/// Places the packages a customer accumulated in their cart.
///
/// Placement rule: every Send/Exchange package always belongs to a GroupOrder, even a
/// lone one. If the customer already has a still-open batch from earlier today (any
/// <see cref="Application.GroupOrders.Commands.Shared.GroupOrderAppendPolicy.Appendable"/>
/// status — i.e. before the courier marks it picked up) at the same pickup address, the
/// new packages silently fold into it instead of starting a new batch; a differing pickup
/// address (or no open batch) starts a fresh one. Return orders are unaffected — always
/// standalone, split out before this rule applies.
///
/// Reuses <see cref="CreateGroupOrderDto"/> for its identical shape (sender + pickup +
/// orders + customer). Distinct from CreateGroupOrderCommand, which the partner API
/// still uses with its always-create-a-new-batch (returns split out) semantics — the
/// same-day merge here is customer-web-app-only.
/// </summary>
public sealed record CheckoutCartCommand(
    CreateGroupOrderDto Dto
) : IRequest<CreateGroupOrderResultDto>;
