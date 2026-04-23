using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Commands.CreateGroupOrder;

/// <summary>
/// MediatR command for creating a GroupOrder with all its packages.
/// Accepts a CreateGroupOrderDto (input) and returns CreateGroupOrderResultDto (output).
/// Both types live in the DTOs folder — reusable, not tied to this command alone.
/// </summary>
public sealed record CreateGroupOrderCommand(
    CreateGroupOrderDto Dto
) : IRequest<CreateGroupOrderResultDto>;
