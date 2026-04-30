using Domain.Enums;

namespace Application.Orders.Queries.GetCourierDailyDeliveries;

public sealed record CourierDailyDeliveriesDto(
    Guid   CourierId,
    string CourierFullName,
    DateOnly Date,
    IReadOnlyList<CourierDailyOrderDto> Orders,
    // Daily totals
    decimal TotalCompanyServicePrice,
    decimal TotalCourierSalary,
    decimal TotalCompanyRevenue
);

public sealed record CourierDailyOrderDto(
    Guid   Id,
    string TrackingNumber,
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientCity,
    string RecipientDistrict,
    OrderStatus Status,
    DateTime? DeliveredAt,
    decimal  CompanyServicePrice,
    decimal? CourierSalary,
    decimal? CompanyRevenue
);
