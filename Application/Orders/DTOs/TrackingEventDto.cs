namespace Application.Orders.DTOs;

public sealed record TrackingEventDto(
    string Status,
    string Description,
    DateTime CreatedAt
);
