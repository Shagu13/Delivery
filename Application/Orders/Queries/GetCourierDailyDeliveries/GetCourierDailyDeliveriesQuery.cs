using MediatR;

namespace Application.Orders.Queries.GetCourierDailyDeliveries;

/// <summary>
/// Admin query: get all delivered orders for a specific courier on a specific date,
/// along with daily financial totals.
/// </summary>
public sealed record GetCourierDailyDeliveriesQuery(Guid CourierId, DateOnly Date)
    : IRequest<CourierDailyDeliveriesDto>;
