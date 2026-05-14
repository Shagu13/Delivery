using MediatR;

namespace Application.Settlements.Commands;

/// <summary>
/// Creates a DailySettlement record for a courier on a specific date.
/// All financial totals are computed from the delivered orders in the database —
/// no financial figures are accepted from the caller.
/// All delivered orders for that date must already have CourierSalary,
/// CompanyServicePrice, and CompanyRevenue set and greater than zero.
/// </summary>
public sealed record CreateDailySettlementCommand(
    Guid     CourierId,
    DateOnly Date
) : IRequest<Guid>;
