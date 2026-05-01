using MediatR;

namespace Application.Settlements.Queries;

/// <summary>
/// Returns a preview of the daily settlement for a given courier and date.
/// Used to pre-populate the admin's settlement modal before saving.
/// </summary>
public sealed record GetSettlementPreviewQuery(Guid CourierId, DateOnly Date)
    : IRequest<SettlementPreviewDto>;
