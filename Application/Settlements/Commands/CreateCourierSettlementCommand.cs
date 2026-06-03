using MediatR;

namespace Application.Settlements.Commands;

/// <summary>
/// Creates a CourierSettlement record for a courier on a specific date.
/// All financial totals are computed from the delivered orders in the database —
/// no financial figures are accepted from the caller.
/// All delivered orders for that date must already have CourierSalary,
/// CompanyServicePrice, and CompanyRevenue set and greater than zero.
///
/// Courier payment: when <paramref name="PayCourierFully"/> is true the courier
/// is recorded as paid their full earned salary (AmountCourierWasPaid =
/// TotalCourierSalary). Otherwise <paramref name="PartialAmountPaid"/> is used
/// (null/omitted records 0 — i.e. not yet paid).
/// </summary>
public sealed record CreateCourierSettlementCommand(
    Guid     CourierId,
    DateOnly Date,
    bool     PayCourierFully  = false,
    decimal? PartialAmountPaid = null
) : IRequest<Guid>;
