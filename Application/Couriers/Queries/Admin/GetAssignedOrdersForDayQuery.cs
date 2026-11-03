using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers.Queries.Admin;

/// <summary>
/// Admin/Operator read: the orders assigned to any courier on the given Georgian calendar day,
/// each tagged with its courierId (the UI groups by courier). Day rule: <see cref="AssignedDay"/>.
/// <paramref name="Date"/> is a Georgian wall-clock day key — timestamps are stored as Georgian
/// wall-clock without an offset, so it compares directly against the column.
/// <paramref name="HideCompanyRevenue"/> is true for Operators.
/// </summary>
public sealed record GetAssignedOrdersForDayQuery(DateTime Date, bool IncludePrevious, bool HideCompanyRevenue)
    : IRequest<IReadOnlyList<AssignedOrderDto>>;

public sealed class GetAssignedOrdersForDayQueryHandler
    : IRequestHandler<GetAssignedOrdersForDayQuery, IReadOnlyList<AssignedOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetAssignedOrdersForDayQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AssignedOrderDto>> Handle(
        GetAssignedOrdersForDayQuery request, CancellationToken cancellationToken)
    {
        DateTime day       = request.Date.Date;
        bool     carryOver = AssignedDay.CarriesOver(day, request.IncludePrevious);
        bool hideRevenue   = request.HideCompanyRevenue;

        return await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId != null)
            .OnAssignedDay(day, carryOver)
            .OrderByDescending(o => o.AssignedToCourierAt)
            .Select(o => new AssignedOrderDto(
                o.CourierId,
                o.Id,
                o.TrackingNumber,
                // The owning store (sender) business name, via either ownership path.
                o.GroupOrder != null && o.GroupOrder.Customer != null
                    ? o.GroupOrder.Customer.BusinessName
                    : (o.Customer != null ? o.Customer.BusinessName : ""),
                o.RecipientName,
                o.RecipientPhone,
                o.RecipientCity,
                o.RecipientDistrict,
                o.RecipientAddress,
                o.Status.ToString(),
                o.CompanyServicePrice,
                o.AmountToCollectForPackage,
                o.CourierSalary,
                o.CourierSalaryPaidAmount,
                // Company margin is internal — hidden from operators.
                hideRevenue ? (decimal?)null : o.CompanyRevenue,
                o.OrderType.ToString(),
                o.AssignedToCourierAt,
                o.DeliveredAt,
                o.DeliveredToWarehouseAt,
                o.CreatedAt))
            .ToListAsync(cancellationToken);
    }
}
