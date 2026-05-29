using Application.Common.Interfaces;
using Application.Common.Models;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.GetAllOrders;

public sealed class GetAllOrdersQueryHandler
    : IRequestHandler<GetAllOrdersQuery, PagedResult<AdminOrderListDto>>
{
    private readonly IAppDbContext _context;

    public GetAllOrdersQueryHandler(IAppDbContext context)
    {
        _context = context;
    }

    public async Task<PagedResult<AdminOrderListDto>> Handle(
        GetAllOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var query = _context.Orders
            .Include(o => o.GroupOrder)
            .AsNoTracking();

        // ── City filter ──────────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(request.City))
            query = query.Where(o => o.RecipientCity == request.City);

        // ── District filter ──────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(request.District))
            query = query.Where(o => o.RecipientDistrict == request.District);

        // ── Courier filter ───────────────────────────────────────────────────
        if (request.CourierId.HasValue)
            query = query.Where(o => o.CourierId == request.CourierId.Value);

        // ── OrderType filter ─────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(request.OrderType) &&
            Enum.TryParse<OrderType>(request.OrderType, out var orderType))
        {
            query = query.Where(o => o.OrderType == orderType);
        }

        // ── Unpriced filter ──────────────────────────────────────────────────
        if (request.Unpriced)
            query = query.Where(o =>
                o.CompanyServicePrice == 0 ||
                o.CourierSalary == null    ||
                o.CourierSalary == 0);

        // ── Active-only filter (exclude terminal statuses) ───────────────────
        if (request.ActiveOnly)
        {
            var terminal = new[]
            {
                OrderStatus.DeliveredToRecipient,
                OrderStatus.CancelledBySender,
                OrderStatus.CancelledByAdmin,
                OrderStatus.OrderNotAccepted,
                OrderStatus.AllDelivered,
                OrderStatus.ReturnedToSender,
                OrderStatus.ExchangeCompleted,
            };
            query = query.Where(o => !terminal.Contains(o.Status));
        }

        // ── Free-text search ─────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            query = query.Where(o =>
                o.TrackingNumber.ToLower().Contains(term) ||
                o.RecipientFirstName.ToLower().Contains(term) ||
                o.RecipientLastName.ToLower().Contains(term) ||
                o.RecipientPhone.Contains(term) ||
                o.RecipientAddress.ToLower().Contains(term) ||
                o.GroupOrder.SenderBusinessName.ToLower().Contains(term) ||
                o.GroupOrder.SenderFirstName.ToLower().Contains(term) ||
                o.GroupOrder.SenderLastName.ToLower().Contains(term)
            );
        }

        // ── Count then page ──────────────────────────────────────────────────
        var totalCount = await query.CountAsync(cancellationToken);

        var entities = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(cancellationToken);

        // Build Georgian-name lookup dictionaries (active records only)
        var cityGeo     = (await _context.Cities    .AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(c => c.CityName)    .ToDictionary(g => g.Key, g => g.First().CityNameGeo);
        var districtGeo = (await _context.Districts .AsNoTracking().Where(d => d.DateDeleted == null).ToListAsync(cancellationToken))
                            .GroupBy(d => d.DistrictName).ToDictionary(g => g.Key, g => g.First().DistrictNameGeo);

        var items = entities
            .Select(o => new AdminOrderListDto(
                Id:                       o.Id,
                TrackingNumber:           o.TrackingNumber,
                SenderBusinessName:       o.GroupOrder.SenderBusinessName,
                SenderFirstName:          o.GroupOrder.SenderFirstName,
                SenderLastName:           o.GroupOrder.SenderLastName,
                SenderPhone:              o.GroupOrder.SenderPhone,
                RecipientFirstName:       o.RecipientFirstName,
                RecipientLastName:        o.RecipientLastName,
                RecipientPhone:           o.RecipientPhone,
                RecipientCity:            o.RecipientCity,
                RecipientCityGeo:         cityGeo.GetValueOrDefault(o.RecipientCity),
                RecipientDistrict:        o.RecipientDistrict,
                RecipientDistrictGeo:     districtGeo.GetValueOrDefault(o.RecipientDistrict),
                RecipientAddress:         o.RecipientAddress,
                Description:              o.Description,
                IsFragile:                o.IsFragile,
                OrderType:                o.OrderType.ToString(),
                Status:                   o.Status.ToString(),
                ProductPaymentStatus:     o.ProductPaymentStatus.ToString(),
                WhoPaysForCompanyService: o.WhoPaysForCompanyService.ToString(),
                ReturnPickupAddress:      o.ReturnPickupAddress,
                ReturnPickupCity:         o.ReturnPickupCity,
                ReturnPickupDistrict:     o.ReturnPickupDistrict,
                AmountToCollectForPackage:o.AmountToCollectForPackage,
                CompanyServicePrice:      o.CompanyServicePrice,
                CourierSalary:            o.CourierSalary,
                CompanyRevenue:           o.CompanyRevenue,
                CreatedAt:                o.CreatedAt,
                DeliveredAt:              o.DeliveredAt
            ))
            .ToList();

        return new PagedResult<AdminOrderListDto>(items, totalCount, request.Page, request.PageSize);
    }
}
