using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Commands.CreateGroupOrder;

/// <summary>
/// MediatR command for placing a GroupOrder with all its packages. Used by the Partner
/// API (<c>POST /api/partner/orders</c>); the web client places orders through
/// <see cref="Application.GroupOrders.Commands.CheckoutCart.CheckoutCartCommand"/>.
///
/// Packages fold into the sender's still-open same-day batch at the same pickup address
/// when one exists (see <see cref="Application.GroupOrders.Commands.Shared.OpenBatchResolver"/>),
/// so a partner posting through the day builds one pickup per address rather than one
/// per call. A fresh batch is started once the courier has collected the previous one.
///
/// Accepts a CreateGroupOrderDto (input) and returns CreateGroupOrderResultDto (output).
/// Both types live in the DTOs folder — reusable, not tied to this command alone.
/// </summary>
public sealed record CreateGroupOrderCommand(
    CreateGroupOrderDto Dto
) : IRequest<CreateGroupOrderResultDto>;
