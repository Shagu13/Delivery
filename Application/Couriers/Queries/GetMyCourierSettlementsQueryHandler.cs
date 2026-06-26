using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Settlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Queries;

public sealed class GetMyCourierSettlementsQueryHandler
    : IRequestHandler<GetMyCourierSettlementsQuery, IReadOnlyList<CourierSettlementItemDto>>
{
    private readonly IAppDbContext _context;
    public GetMyCourierSettlementsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CourierSettlementItemDto>> Handle(
        GetMyCourierSettlementsQuery request,
        CancellationToken cancellationToken)
    {
        // Resolve the courier entity from the Identity user ID stored in the JWT
        var courier = await _context.Couriers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CourierUserId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierUserId);

        var monthStart = new DateTime(request.Year, request.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd   = monthStart.AddMonths(1);

        return await CourierSettlementProjection
            .BuildAsync(_context, courier.Id, monthStart, monthEnd, cancellationToken);
    }
}
