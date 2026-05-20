using Application.Settlements.DTOs;
using MediatR;

namespace Application.Settlements.Queries;

/// <summary>
/// Courier-facing query: returns all daily settlement records for the
/// currently authenticated courier, newest first.
/// </summary>
public sealed record GetMyCourierSettlementsQuery(string CourierUserId)
    : IRequest<IReadOnlyList<CourierSettlementItemDto>>;
