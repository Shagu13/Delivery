using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetAllGroupOrders;

public sealed class GetAllGroupOrdersQueryHandler
    : IRequestHandler<GetAllGroupOrdersQuery, IReadOnlyList<AdminGroupOrderDto>>
{
    private readonly IAppDbContext _context;

    public GetAllGroupOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AdminGroupOrderDto>> Handle(
        GetAllGroupOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var query = _context.GroupOrders
            .Include(go => go.Orders)
            .Include(go => go.Courier)       // ← pickup courier
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var term = request.SearchTerm.Trim().ToLower();

            query = query.Where(go =>
                go.SenderFirstName.ToLower().Contains(term) ||
                go.SenderLastName.ToLower().Contains(term) ||
                go.SenderBusinessName.ToLower().Contains(term) ||
                go.SenderPhone.Contains(term) ||
                go.PickUpCity.ToLower().Contains(term) ||
                go.PickUpDistrict.ToLower().Contains(term) ||
                go.PickUpAddress.ToLower().Contains(term) ||
                go.Orders.Any(o =>
                    o.RecipientFirstName.ToLower().Contains(term) ||
                    o.RecipientLastName.ToLower().Contains(term) ||
                    o.RecipientPhone.Contains(term) ||
                    o.RecipientCity.ToLower().Contains(term) ||
                    o.RecipientDistrict.ToLower().Contains(term) ||
                    o.RecipientAddress.ToLower().Contains(term) ||
                    o.TrackingNumber.ToLower().Contains(term))
            );
        }

        var groupOrders = await query
            .OrderByDescending(go => go.CreatedAt)
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
            CourierId:         go.CourierId,
            CourierFullName:   go.Courier is null
                ? null
                : $"{go.Courier.FirstName} {go.Courier.LastName}",
            Orders: go.Orders
                .OrderBy(o => o.CreatedAt)
                .Select(o => new AdminOrderDto(
                    Id:                 o.Id,
                    TrackingNumber:     o.TrackingNumber,
                    RecipientFirstName: o.RecipientFirstName,
                    RecipientLastName:  o.RecipientLastName,
                    RecipientPhone:     o.RecipientPhone,
                    RecipientCity:      o.RecipientCity,
                    RecipientDistrict:  o.RecipientDistrict,
                    RecipientAddress:   o.RecipientAddress,
                    Description:        o.Description,
                    Status:             o.Status,
                    IsPaid:             o.IsPaid,
                    CourierId:          o.CourierId,
                    CreatedAt:          o.CreatedAt))
                .ToList()
        )).ToList();
    }
}
