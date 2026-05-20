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
