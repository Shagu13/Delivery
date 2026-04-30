using Application.Common.Interfaces;
using Application.GroupOrders.Queries.GetAllGroupOrders;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetCustomerGroupOrders;

public sealed record GetCustomerGroupOrdersQuery(Guid CustomerId)
    : IRequest<IReadOnlyList<AdminGroupOrderDto>>;

public sealed class GetCustomerGroupOrdersQueryHandler
    : IRequestHandler<GetCustomerGroupOrdersQuery, IReadOnlyList<AdminGroupOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomerGroupOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AdminGroupOrderDto>> Handle(
        GetCustomerGroupOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var groupOrders = await _context.GroupOrders
            .Where(g => g.CustomerId == request.CustomerId)
            .Include(g => g.Orders)
            .Include(g => g.Courier)
            .AsNoTracking()
            .OrderByDescending(g => g.CreatedAt)
            .ToListAsync(cancellationToken);

        return groupOrders.Select(go => new AdminGroupOrderDto(
            Id:                      go.Id,
            CreatedAt:               go.CreatedAt,
            Status:                  go.Status,
            SenderFirstName:         go.SenderFirstName,
            SenderLastName:          go.SenderLastName,
            SenderIdNumber:          go.SenderIdNumber,
            SenderBusinessName:      go.SenderBusinessName,
            SenderPhone:             go.SenderPhone,
            PickUpCity:              go.PickUpCity,
            PickUpDistrict:          go.PickUpDistrict,
            PickUpAddress:           go.PickUpAddress,
            Note:                    go.Note,
            NumberOfPackages:        go.NumberOfPackages,
            WhenPackagePickedUpDate: go.WhenPackagePickedUpDate,
            CourierId:               go.CourierId,
            CourierFullName:         go.Courier is null
                ? null
                : $"{go.Courier.FirstName} {go.Courier.LastName}",
            Orders: go.Orders
                .OrderBy(o => o.CreatedAt)
                .Select(o => new AdminOrderDto(
                    Id:                      o.Id,
                    TrackingNumber:          o.TrackingNumber,
                    RecipientFirstName:      o.RecipientFirstName,
                    RecipientLastName:       o.RecipientLastName,
                    RecipientPhone:          o.RecipientPhone,
                    RecipientCity:           o.RecipientCity,
                    RecipientDistrict:       o.RecipientDistrict,
                    RecipientAddress:        o.RecipientAddress,
                    Description:             o.Description,
                    IsFragile:               o.IsFragile,
                    Status:                  o.Status,
                    ProductPaymentStatus:    o.ProductPaymentStatus,
                    WhoPaysForCompanyService: o.WhoPaysForCompanyService,
                    CourierSalary:           o.CourierSalary,
                    CompanyServicePrice:     o.CompanyServicePrice,
                    CompanyRevenue:          o.CompanyRevenue,
                    CourierId:               o.CourierId,
                    CreatedAt:               o.CreatedAt,
                    DeliveryDateFrom:        o.DeliveryDateFrom,
                    DeliveryDateTo:          o.DeliveryDateTo))
                .ToList()
        )).ToList();
    }
}
