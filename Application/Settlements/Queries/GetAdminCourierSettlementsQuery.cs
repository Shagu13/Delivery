using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Settlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Queries;

/// <summary>
/// Admin: a courier's day-by-day settlement summaries, newest first, derived live by
/// grouping the courier's delivered orders (no stored settlement rows).
/// </summary>
public sealed record GetAdminCourierSettlementsQuery(
    Guid CourierId
) : IRequest<IReadOnlyList<CourierSettlementItemDto>>;

public sealed class GetAdminCourierSettlementsQueryHandler
    : IRequestHandler<GetAdminCourierSettlementsQuery, IReadOnlyList<CourierSettlementItemDto>>
{
    private readonly IAppDbContext _context;
    public GetAdminCourierSettlementsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CourierSettlementItemDto>> Handle(
        GetAdminCourierSettlementsQuery request,
        CancellationToken cancellationToken)
    {
        var courierExists = await _context.Couriers
            .AnyAsync(c => c.Id == request.CourierId, cancellationToken);
        if (!courierExists)
            throw new NotFoundException("Courier", request.CourierId);

        // All history → bound the range generously.
        var fromDt = DateTime.SpecifyKind(DateTime.MinValue, DateTimeKind.Utc);
        var toDt   = DateTime.SpecifyKind(DateTime.MaxValue, DateTimeKind.Utc);

        return await CourierSettlementProjection
            .BuildAsync(_context, request.CourierId, fromDt, toDt, cancellationToken);
    }
}
