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

        var settlements = await _context.DailySettlements
            .AsNoTracking()
            .Where(s => s.CourierId == courier.Id)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(cancellationToken);

        return settlements.Select(s => new CourierSettlementItemDto(
            Id:                            s.Id,
            Date:                          DateOnly.FromDateTime(s.CreatedAt).ToString("yyyy-MM-dd"),
            TotalOrdersPickedUp:           s.TotalOrdersPickedUp,
            TotalOrdersDelivered:          s.TotalOrdersDelivered,
            TotalAmountOfCashCollected:    s.TotalAmountOfCashCollected ?? 0m,
            TotalCompanyServiceRevenue:    s.TotalCompanyServiceRevenue,
            TotalCourierSalary:            s.TotalCourierSalary,
            TotalCourierTransferToCompany: s.TotalCourierTransferToCompany,
            IsTheDayClosed:               s.IsTheDayClosed
        )).ToList();
    }
}
