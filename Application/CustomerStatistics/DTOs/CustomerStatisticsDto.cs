namespace Application.CustomerStatistics.DTOs;

/// <summary>
/// Order activity statistics for a single customer, scoped to one calendar year.
/// Drives the customer Statistics page (monthly charts + top recipients).
/// </summary>
public sealed record CustomerStatisticsDto(
    int Year,
    IReadOnlyList<int> AvailableYears,
    IReadOnlyList<MonthlyOrderStatDto> Monthly,
    int TotalPlaced,
    int TotalDelivered,
    int TotalInTransit,
    int TotalCancelled,
    IReadOnlyList<TopRecipientDto> TopRecipients
);

/// <summary>Order counts for one month of the selected year, split by outcome.</summary>
public sealed record MonthlyOrderStatDto(
    int Month,        // 1–12
    int Placed,
    int Delivered,
    int InTransit,
    int Cancelled
);

/// <summary>A frequent recipient the customer ships to, with their latest contact details.</summary>
public sealed record TopRecipientDto(
    string Name,
    string Phone,
    string City,
    string District,
    string Address,
    int OrderCount
);
