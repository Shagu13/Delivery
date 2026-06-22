using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetAllGroupOrders;

public sealed class GetAllGroupOrdersQueryHandler
    : IRequestHandler<GetAllGroupOrdersQuery, IReadOnlyList<AdminGroupOrderDto>>
{
    private static readonly OrderStatus[] CancelledStatuses =
    {
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    private readonly IAppDbContext _context;
    public GetAllGroupOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AdminGroupOrderDto>> Handle(
        GetAllGroupOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var query = _context.GroupOrders
            .Include(go => go.Orders)
            .Include(go => go.Courier)
            .Include(go => go.Customer)
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
                    o.RecipientName.ToLower().Contains(term) ||
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

        // Build lookup dictionaries for Georgian names (active records only)
        var cityGeo     = (await _context.Cities    .AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(c => c.CityName)    .ToDictionary(g => g.Key, g => g.First().CityNameGeo);
        var districtGeo = (await _context.Districts .AsNoTracking().Where(d => d.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(d => d.DistrictName).ToDictionary(g => g.Key, g => g.First().DistrictNameGeo);

        AdminOrderDto MapOrder(Order o) => new(
            Id:                               o.Id,
            TrackingNumber:                   o.TrackingNumber,
            RecipientName:                    o.RecipientName,
            RecipientPhone:                   o.RecipientPhone,
            RecipientCity:                    o.RecipientCity,
            RecipientCityGeo:                 cityGeo.GetValueOrDefault(o.RecipientCity),
            RecipientDistrict:                o.RecipientDistrict,
            RecipientDistrictGeo:             districtGeo.GetValueOrDefault(o.RecipientDistrict),
            RecipientAddress:                 o.RecipientAddress,
            Description:                      o.Description,
            IsFragile:                        o.IsFragile,
            OrderType:                        o.OrderType,
            ReturnPickupAddress:              o.ReturnPickupAddress,
            ReturnPickupCity:                 o.ReturnPickupCity,
            ReturnPickupDistrict:             o.ReturnPickupDistrict,
            Status:                           o.Status,
            ProductPaymentStatus:             o.ProductPaymentStatus,
            WhoPaysForCompanyService:         o.WhoPaysForCompanyService,
            AmountToCollectForPackage:        o.AmountToCollectForPackage,
            AmountOfCashCollected:            o.AmountOfCashCollected,
            CourierSalary:                    o.CourierSalary,
            CompanyServicePrice:              o.CompanyServicePrice,
            IsCompanyServicePriceIncluded:    o.IsCompanyServicePriceIncluded,
            CompanyRevenue:                   o.CompanyRevenue,
            CourierId:                        o.CourierId,
            CreatedAt:                        o.CreatedAt,
            DeliveryDateFrom:                 o.DeliveryDateFrom,
            DeliveryDateTo:                   o.DeliveryDateTo,
            DeliveredAt:                      o.DeliveredAt,
            CancellationReason:               o.CancellationReason,
            CancellationComment:              o.CancellationComment);

        var result = groupOrders.Select(go => new AdminGroupOrderDto(
            Id:                      go.Id,
            CreatedAt:               go.CreatedAt,
            Status:                  go.Status,
            CustomerId:              go.CustomerId,
            SenderFirstName:         go.SenderFirstName,
            SenderLastName:          go.SenderLastName,
            SenderIdNumber:          go.SenderIdNumber,
            SenderBusinessName:      go.SenderBusinessName,
            SenderPhone:             go.SenderPhone,
            AlternativeSenderPhone:  go.AlternativeSenderPhone,
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
            CompanyServiceCapitalPrice:  go.Customer?.CompanyServiceCapitalPrice,
            CompanyServiceCityPrice:     go.Customer?.CompanyServiceCityPrice,
            CompanyServiceDistrictPrice: go.Customer?.CompanyServiceDistrictPrice,
            Orders: go.Orders.OrderBy(o => o.CreatedAt).Select(MapOrder).ToList()
        )).ToList();

        // ── Standalone orders (GroupOrderId == null) as synthetic single-order batches ──
        // Cart checkout with one package stores the order un-batched. Surface each as a
        // group-order-shaped row (flagged IsStandalone) so it appears in the admin list
        // alongside real batches; the sender/pickup come from the owning customer.
        var standaloneQuery = _context.Orders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Where(o => o.GroupOrderId == null
                     && o.CustomerId != null
                     && !CancelledStatuses.Contains(o.Status));

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var term = request.SearchTerm.Trim().ToLower();
            standaloneQuery = standaloneQuery.Where(o =>
                o.RecipientName.ToLower().Contains(term) ||
                o.RecipientPhone.Contains(term) ||
                o.RecipientCity.ToLower().Contains(term) ||
                o.RecipientDistrict.ToLower().Contains(term) ||
                o.RecipientAddress.ToLower().Contains(term) ||
                o.TrackingNumber.ToLower().Contains(term) ||
                (o.Customer != null && (
                    o.Customer.BusinessName.ToLower().Contains(term) ||
                    o.Customer.FirstName.ToLower().Contains(term) ||
                    o.Customer.LastName.ToLower().Contains(term) ||
                    o.Customer.PhoneNumber.Contains(term))));
        }

        var standalone = await standaloneQuery
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(cancellationToken);

        foreach (var o in standalone)
        {
            var c = o.Customer;
            result.Add(new AdminGroupOrderDto(
                Id:                      o.Id,
                CreatedAt:               o.CreatedAt,
                Status:                  o.Status,
                CustomerId:              o.CustomerId,
                SenderFirstName:         c?.FirstName ?? string.Empty,
                SenderLastName:          c?.LastName ?? string.Empty,
                SenderIdNumber:          c?.IdNumber,
                SenderBusinessName:      c?.BusinessName ?? string.Empty,
                SenderPhone:             c?.PhoneNumber ?? string.Empty,
                AlternativeSenderPhone:  null,
                PickUpCity:              c?.City ?? string.Empty,
                PickUpCityGeo:           c is null ? null : cityGeo.GetValueOrDefault(c.City),
                PickUpDistrict:          c?.District ?? string.Empty,
                PickUpDistrictGeo:       c is null ? null : districtGeo.GetValueOrDefault(c.District),
                PickUpAddress:           c?.Address ?? string.Empty,
                Note:                    null,
                NumberOfPackages:        1,
                WhenPackagePickedUpDate: null,
                CourierId:               o.CourierId,
                CourierFullName:         null,
                CompanyServiceCapitalPrice:  c?.CompanyServiceCapitalPrice,
                CompanyServiceCityPrice:     c?.CompanyServiceCityPrice,
                CompanyServiceDistrictPrice: c?.CompanyServiceDistrictPrice,
                Orders:                  new List<AdminOrderDto> { MapOrder(o) },
                IsStandalone:            true));
        }

        return result
            .OrderByDescending(go => go.CreatedAt)
            .ToList();
    }
}
