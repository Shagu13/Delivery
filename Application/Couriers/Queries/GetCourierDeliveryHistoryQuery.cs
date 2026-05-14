using Application.Orders.DTOs;
using MediatR;

namespace Application.Courier.Queries;

/// <summary>Returns all completed (or cancelled) last-mile deliveries for the given courier.</summary>
public sealed record GetCourierDeliveryHistoryQuery(string CourierUserId)
    : IRequest<IReadOnlyList<CourierOrderHistoryDto>>;
