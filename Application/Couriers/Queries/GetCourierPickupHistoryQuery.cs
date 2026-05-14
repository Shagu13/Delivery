using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.Courier.Queries;

/// <summary>Returns all completed group-order pickups (delivered to warehouse or beyond) for the given courier.</summary>
public sealed record GetCourierPickupHistoryQuery(string CourierUserId)
    : IRequest<IReadOnlyList<CourierPickupHistoryDto>>;
