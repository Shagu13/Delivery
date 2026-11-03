using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers.Queries.Admin;

/// <summary>
/// Admin/Operator read: every order ever assigned to this courier, regardless of status, newest first.
/// Returns <c>null</c> when the courier does not exist (the controller maps it to 404).
/// <paramref name="HideCompanyRevenue"/> is true for Operators — company margin is internal.
/// </summary>
public sealed record GetAdminCourierOrdersQuery(Guid CourierId, bool HideCompanyRevenue)
    : IRequest<IReadOnlyList<AdminCourierOrderDto>?>;

public sealed class GetAdminCourierOrdersQueryHandler
    : IRequestHandler<GetAdminCourierOrdersQuery, IReadOnlyList<AdminCourierOrderDto>?>
{
    private readonly IAppDbContext _context;
    public GetAdminCourierOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AdminCourierOrderDto>?> Handle(
        GetAdminCourierOrdersQuery request, CancellationToken cancellationToken)
    {
        var exists = await _context.Couriers.AnyAsync(c => c.Id == request.CourierId, cancellationToken);
        if (!exists) return null;

        bool hideRevenue = request.HideCompanyRevenue;
        return await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == request.CourierId)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new AdminCourierOrderDto(
                o.Id,
                o.TrackingNumber,
                o.RecipientName,
                o.RecipientPhone,
                o.RecipientCity,
                o.RecipientDistrict,
                o.RecipientAddress,
                o.Status.ToString(),
                o.CompanyServicePrice,
                o.CourierSalary,
                // Company margin is internal — hidden from operators.
                hideRevenue ? (decimal?)null : o.CompanyRevenue,
                o.OrderType.ToString(),
                o.DeliveredAt,
                o.DeliveredToWarehouseAt,
                o.CreatedAt))
            .ToListAsync(cancellationToken);
    }
}
