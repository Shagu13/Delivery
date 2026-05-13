using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
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

        var cityGeo     = (await _context.Cities   .AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(c => c.CityName)    .ToDictionary(g => g.Key, g => g.First().CityNameGeo);
        var districtGeo = (await _context.Districts.AsNoTracking().Where(d => d.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(d => d.DistrictName).ToDictionary(g => g.Key, g => g.First().DistrictNameGeo);

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
            PickUpCityGeo:           cityGeo.GetValueOrDefault(go.PickUpCity),
            PickUpDistrict:          go.PickUpDistrict,
            PickUpDistrictGeo:       districtGeo.GetValueOrDefault(go.PickUpDistrict),
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
                    Id:                               o.Id,
                    TrackingNumber:                   o.TrackingNumber,
                    RecipientFirstName:               o.RecipientFirstName,
                    RecipientLastName:                o.RecipientLastName,
                    RecipientPhone:                   o.RecipientPhone,
                    RecipientCity:                    o.RecipientCity,
                    RecipientCityGeo:                 cityGeo.GetValueOrDefault(o.RecipientCity),
                    RecipientDistrict:                o.RecipientDistrict,
                    RecipientDistrictGeo:             districtGeo.GetValueOrDefault(o.RecipientDistrict),
                    RecipientAddress:                 o.RecipientAddress,
                    Description:                      o.Description,
                    IsFragile:                        o.IsFragile,
                    Status:                           o.Status,
                    ProductPaymentStatus:             o.ProductPaymentStatus,
                    WhoPaysForCompanyService:         o.WhoPaysForCompanyService,
                    CourierSalary:                    o.CourierSalary,
                    CompanyServicePrice:              o.CompanyServicePrice,
                    CompanyRevenue:                   o.CompanyRevenue,
                    CourierId:                        o.CourierId,
                    CreatedAt:                        o.CreatedAt,
                    DeliveryDateFrom:                 o.DeliveryDateFrom,
                    DeliveryDateTo:                   o.DeliveryDateTo))
                .ToList()
        )).ToList();
    }
}
