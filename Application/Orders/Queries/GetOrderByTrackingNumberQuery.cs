using Application.Orders.DTOs;
using MediatR;

namespace Application.Orders.Queries.GetOrderByTrackingNumber;

/// <summary>
/// Public query — no auth required.
/// Returns full tracking info for the given tracking number.
/// Throws NotFoundException if the tracking number doesn't exist.
/// </summary>
public sealed record GetOrderByTrackingNumberQuery(string TrackingNumber)
    : IRequest<TrackOrderDto>;
