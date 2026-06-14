using MediatR;

namespace Application.Orders.Queries;

public sealed record GetReturnExchangeOrdersQuery() : IRequest<IReadOnlyList<ReturnExchangeOrderDto>>;

public sealed record ReturnExchangeOrderDto(
    Guid    Id,
    string  TrackingNumber,
    string  OrderType,          // "Return" | "Exchange"
    string  Status,
    string  SenderName,
    string  SenderPhone,
    Guid?   CustomerId,
    string  RecipientName,
    string  RecipientPhone,
    string  RecipientCity,
    string  RecipientDistrict,
    string  RecipientAddress,
    // Return-specific pickup address (where courier collects from)
    string? ReturnPickupCity,
    string? ReturnPickupDistrict,
    string? ReturnPickupAddress,
    Guid?   CourierId,
    string? CourierFullName,
    string? CourierPhone,
    decimal  CompanyServicePrice,
    decimal? CourierSalary,
    DateTime  CreatedAt,
    DateTime? PickedUpFromRecipientAt,
    DateTime? DeliveredToWarehouseAt,
    DateTime? DeliveredAt
);
