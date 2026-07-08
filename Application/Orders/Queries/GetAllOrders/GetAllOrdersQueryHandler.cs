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
            .Include(o => o.Customer)
            .Include(o => o.Courier)
            .AsNoTracking();

        // ── City filter ──────────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(request.City))
            query = query.Where(o => o.RecipientCity == request.City);

        // ── Tenant scope (co-admin) — only this tenant's orders, via either ownership path ──
        if (request.TenantId is Guid tenantId)
            query = query.Where(o =>
                (o.GroupOrder != null && o.GroupOrder.Customer != null && o.GroupOrder.Customer.TenantId == tenantId)
                || (o.Customer != null && o.Customer.TenantId == tenantId));

        // ── District filter ──────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(request.District))
            query = query.Where(o => o.RecipientDistrict == request.District);

        // ── Courier filter ───────────────────────────────────────────────────
        if (request.CourierId.HasValue)
            query = query.Where(o => o.CourierId == request.CourierId.Value);

        // ── Assigned / unassigned filter (Packages page tabs) ────────────────
        // No courier on the order → "Pending Assign"; a courier set → "Assigned".
        if (request.Assigned == true)
            query = query.Where(o => o.CourierId != null);
        else if (request.Assigned == false)
            query = query.Where(o => o.CourierId == null);

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

        // ── Postponed filter ─────────────────────────────────────────────────
        if (request.Postponed)
            query = query.Where(o => o.Status == OrderStatus.DeliveryPostponed);

        // ── Created-day filter (Delivery page day navigator) ─────────────────
        // CreatedAt is stored as Georgian wall-clock. Compared directly (no .Date
        // call) against an exclusive upper bound so the index on CreatedAt stays
        // usable — Date alone = single day; Date + DateTo = an inclusive [Date..DateTo] range.
        if (request.Date.HasValue)
        {
            var from = request.Date.Value.Date;
            var to   = (request.DateTo ?? request.Date).Value.Date.AddDays(1);
            query = query.Where(o => o.CreatedAt >= from && o.CreatedAt < to);
        }

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
                o.RecipientName.ToLower().Contains(term) ||
                o.RecipientPhone.Contains(term) ||
                o.RecipientAddress.ToLower().Contains(term) ||
                (o.GroupOrder != null && o.GroupOrder.SenderBusinessName.ToLower().Contains(term)) ||
                (o.GroupOrder != null && o.GroupOrder.SenderFirstName.ToLower().Contains(term)) ||
                (o.GroupOrder != null && o.GroupOrder.SenderLastName.ToLower().Contains(term)) ||
                (o.Customer != null && o.Customer.BusinessName.ToLower().Contains(term)) ||
                (o.Customer != null && o.Customer.PhoneNumber.Contains(term))
            );
        }

        // ── Count then page ──────────────────────────────────────────────────
        var totalCount = await query.CountAsync(cancellationToken);

        // ── Ordering ─────────────────────────────────────────────────────────
        // Orders still actionable on the Delivery page float to the top, oldest-first
        // (FIFO) so the longest-waiting ones get handled first. "Actionable" = any
        // Send/Exchange in the last-mile flow (warehouse-accepted, en-route, assigned,
        // out-for-delivery, postponed) plus Returns still awaiting pickup assignment —
        // anything an admin can Assign or Mark Delivered here. Price/salary no longer
        // gate the float: an unpriced warehouse order is still ready for action (you set
        // the price/salary on this page). Everything else falls below, also oldest-first.
        var entities = await query
            .OrderByDescending(o =>
                ((o.OrderType == OrderType.Send || o.OrderType == OrderType.Exchange)
                    && (o.Status == OrderStatus.AdminAcceptedOrderInWareHouse
                        || o.Status == OrderStatus.OrderIsOnItsWayToRecipientsCity
                        || o.Status == OrderStatus.CourierAssignedToDeliver
                        || o.Status == OrderStatus.CourierDeliveringTheOrderToRecipient
                        || o.Status == OrderStatus.DeliveryPostponed))
                || (o.OrderType == OrderType.Return
                    && (o.Status == OrderStatus.Pending
                        || o.Status == OrderStatus.CourierAssignedToPickUp)))
            .ThenBy(o => o.CreatedAt)
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
                SenderBusinessName:       o.GroupOrder?.SenderBusinessName ?? o.Customer?.BusinessName ?? string.Empty,
                SenderFirstName:          o.GroupOrder?.SenderFirstName    ?? o.Customer?.FirstName    ?? string.Empty,
                SenderLastName:           o.GroupOrder?.SenderLastName     ?? o.Customer?.LastName     ?? string.Empty,
                SenderPhone:              o.GroupOrder?.SenderPhone        ?? o.Customer?.PhoneNumber  ?? string.Empty,
                AlternativeSenderPhone:   o.GroupOrder?.AlternativeSenderPhone,
                RecipientName:            o.RecipientName,
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
                IsCompanyServicePriceIncluded: o.IsCompanyServicePriceIncluded,
                CourierSalary:            o.CourierSalary,
                // Company margin is dilo-internal — never shown to a tenant co-admin or an operator.
                CompanyRevenue:           request.TenantId.HasValue || request.HideCompanyRevenue ? null : o.CompanyRevenue,
                CourierId:                o.CourierId,
                CourierFullName:          o.Courier == null ? null : $"{o.Courier.FirstName} {o.Courier.LastName}".Trim(),
                CreatedAt:                o.CreatedAt,
                DeliveredAt:              o.DeliveredAt,
                PostponeReason:           o.PostponeReason == null ? null : o.PostponeReason.Value.ToString()
            ))
            .ToList();

        return new PagedResult<AdminOrderListDto>(items, totalCount, request.Page, request.PageSize);
    }
}
