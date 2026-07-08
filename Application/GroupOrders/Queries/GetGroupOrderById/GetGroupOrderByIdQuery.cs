using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Queries.GetGroupOrderById;

/// <summary>
/// Looks up a single batch (or standalone order, surfaced as a synthetic single-order
/// batch) by id, with no date window — so it keeps working regardless of how old it is,
/// unlike the paginated <see cref="Application.GroupOrders.Queries.GetAllGroupOrders.GetAllGroupOrdersQuery"/>.
/// </summary>
public sealed record GetGroupOrderByIdQuery(Guid Id) : IRequest<AdminGroupOrderDto?>;
