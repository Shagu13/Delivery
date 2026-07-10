using MediatR;
using Application.GroupOrders.DTOs;
using Application.Couriers.DTOs;

namespace Application.Courier.Queries;

/// <summary>Returns all GroupOrders assigned to this courier that are in pickup-phase statuses.</summary>
public sealed record GetCourierGroupOrdersQuery(string CourierUserId)
    : IRequest<IReadOnlyList<GroupOrderResponseDto>>;

/// <summary>Returns all Orders assigned to this courier for last-mile delivery.</summary>
public sealed record GetCourierOrdersQuery(string CourierUserId)
    : IRequest<IReadOnlyList<CourierOrderDto>>;

/// <summary>Returns all standalone Return orders assigned to this courier that are in
/// pickup-phase statuses — collected from the recipient, not from a sender batch, but
/// surfaced on the courier's Pickups tab since it's the same kind of job (go collect a
/// parcel) rather than a last-mile delivery.</summary>
public sealed record GetCourierReturnPickupsQuery(string CourierUserId)
    : IRequest<IReadOnlyList<CourierOrderDto>>;
