using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Settlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Queries;

/// <summary>
/// Admin: all saved daily settlements for a specific courier, newest first.
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

        var settlements = await _context.CourierSettlements
            .AsNoTracking()
            .Where(s => s.CourierId == request.CourierId)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(cancellationToken);

        return settlements.Select(s => new CourierSettlementItemDto(
            Id:                            s.Id,
            Date:                          DateOnly.FromDateTime(s.CreatedAt).ToString("yyyy-MM-dd"),
            TotalOrdersPickedUp:           s.TotalOrdersPickedUp,
            TotalOrdersDelivered:          s.TotalOrdersDelivered,
            NumberOfOrdersCancelled:       s.NumberOfOrdersCancelled,
            NumberOfOrderPostponed:        s.NumberOfOrderPostponed,
            TotalAmountOfCashCollected:    s.TotalAmountOfCashCollected ?? 0m,
            TotalCompanyServiceRevenue:    s.TotalCompanyServiceRevenue,
            TotalCourierSalary:            s.TotalCourierSalary,
            AmountCourierWasPaid:          s.AmountCourierWasPaid,
            TotalCourierTransferToCompany: s.TotalCourierTransferToCompany,
            IsTheDayClosed:               s.IsTheDayClosed
        )).ToList();
    }
}
