using Application.Common.Interfaces;
using Application.GroupOrders.Queries.GetAllGroupOrders;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetCustomerGroupOrders;

// ── Query ─────────────────────────────────────────────────────────────────────

public sealed record GetCustomerGroupOrdersQuery(Guid CustomerId)
    : IRequest<IReadOnlyList<AdminGroupOrderDto>>;

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class GetCustomerGroupOrdersQueryHandler
    : IRequestHandler<GetCustomerGroupOrdersQuery, IReadOnlyList<AdminGroupOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomerGroupOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AdminGroupOrderDto>> Handle(
        GetCustomerGroupOrdersQuery request,
        CancellationToken           cancellationToken)
    {
        var groupOrders = await _context.GroupOrders
            .Where(g => g.CustomerId == request.CustomerId)
            .Include(g => g.Orders)
            .Include(g => g.Courier)
            .AsNoTracking()
            .OrderByDescending(g => g.CreatedAt)
            .ToListAsync(cancellationToken);

        return groupOrders.Select(go => new AdminGroupOrderDto(
            Id:                go.Id,
            CreatedAt:         go.CreatedAt,
            Status:            go.Status,
            SenderFirstName:   go.SenderFirstName,
            SenderLastName:    go.SenderLastName,
            SenderIdNumber:    go.SenderIdNumber,
            SenderBusinessName: go.SenderBusinessName,
            SenderPhone:       go.SenderPhone,
            PickUpCity:        go.PickUpCity,
            PickUpDistrict:    go.PickUpDistrict,
            PickUpAddress:     go.PickUpAddress,
            Note:              go.Note,
            NumberOfPackages:  go.NumberOfPackages,
            CourierId: go.CourierId,        // ← add this
            CourierFullName: null,
            Orders: go.Orders
                .OrderBy(o => o.CreatedAt)
                .Select(o => new AdminOrderDto(
                    o.Id, o.TrackingNumber,
                    o.RecipientFirstName, o.RecipientLastName,
                    o.RecipientPhone, o.RecipientCity,
                    o.RecipientDistrict, o.RecipientAddress,
                    o.Description, o.Status, o.IsPaid, null, o.CreatedAt))
                .ToList()
        )).ToList();
    }
}
