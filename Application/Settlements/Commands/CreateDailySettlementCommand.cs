using MediatR;

namespace Application.Settlements.Commands;

/// <summary>
/// Creates a DailySettlement record for a courier on a specific date.
/// All delivered orders for that date must already have CourierSalary,
/// CompanyServicePrice, and CompanyRevenue set and greater than zero.
/// </summary>
public sealed record CreateDailySettlementCommand(
    Guid     CourierId,
    DateOnly Date,
    int      TotalOrdersPickedUp,
    int      TotalOrdersDelivered,
    decimal? TotalAmountOfCashCollected,
    decimal  TotalCompanyServiceRevenue,
    decimal  TotalCourierSalary,
    decimal  TotalCompanyNetIncome
) : IRequest<Guid>;
