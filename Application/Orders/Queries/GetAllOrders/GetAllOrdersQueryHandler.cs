using Application.Common.Search;
using Application.Common.Interfaces;
using Application.Common.Models;
using Application.Finance;
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
        // Party = "recipient" restricts the search to the Order's own recipient fields
        // (tracking/name/phone/address/city/district) — sender/customer fields are
        // excluded so a recipient-side search never matches on the sender's name.
        // Party = "sender" restricts to sender/customer fields (name/phone/pickup
        // city/district/address). Otherwise (null) it matches either side.
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            // Prefix match, not "contains anywhere" — see GetAllGroupOrdersQueryHandler's
            // search block for why (sargable StartsWith + an index per field vs. a Contains()
            // scan; DB collation is case-insensitive so .ToLower() is unnecessary either way).
            var term = request.Search.Trim();
            var bn   = BusinessNameSearch.Variants(term); // shop names may be stored as "Name"
            var matchesRecipient = request.Party != "sender";
            var matchesSender    = request.Party != "recipient";
            query = query.Where(o =>
                (matchesRecipient &&
                    (o.TrackingNumber.StartsWith(term) ||
                     o.RecipientName.StartsWith(term) ||
                     o.RecipientPhone.StartsWith(term) ||
                     o.RecipientAddress.StartsWith(term) ||
                     o.RecipientCity.StartsWith(term) ||
                     o.RecipientDistrict.StartsWith(term)))
                ||
                (matchesSender &&
                    ((o.GroupOrder != null && (o.GroupOrder.SenderBusinessName.StartsWith(bn[0]) || o.GroupOrder.SenderBusinessName.StartsWith(bn[1]) || o.GroupOrder.SenderBusinessName.StartsWith(bn[2]) || o.GroupOrder.SenderBusinessName.StartsWith(bn[3]) || o.GroupOrder.SenderBusinessName.StartsWith(bn[4]) || o.GroupOrder.SenderBusinessName.StartsWith(bn[5]) || o.GroupOrder.SenderBusinessName.StartsWith(bn[6]))) ||
                     (o.GroupOrder != null && o.GroupOrder.SenderFirstName.StartsWith(term)) ||
                     (o.GroupOrder != null && o.GroupOrder.SenderLastName.StartsWith(term)) ||
                     (o.GroupOrder != null && o.GroupOrder.SenderPhone.StartsWith(term)) ||
                     (o.GroupOrder != null && o.GroupOrder.AlternativeSenderPhone != null && o.GroupOrder.AlternativeSenderPhone.StartsWith(term)) ||
                     (o.GroupOrder != null && o.GroupOrder.PickUpCity.StartsWith(term)) ||
                     (o.GroupOrder != null && o.GroupOrder.PickUpDistrict.StartsWith(term)) ||
                     (o.GroupOrder != null && o.GroupOrder.PickUpAddress.StartsWith(term)) ||
                     (o.Customer != null && (o.Customer.BusinessName.StartsWith(bn[0]) || o.Customer.BusinessName.StartsWith(bn[1]) || o.Customer.BusinessName.StartsWith(bn[2]) || o.Customer.BusinessName.StartsWith(bn[3]) || o.Customer.BusinessName.StartsWith(bn[4]) || o.Customer.BusinessName.StartsWith(bn[5]) || o.Customer.BusinessName.StartsWith(bn[6]))) ||
                     (o.Customer != null && o.Customer.PhoneNumber.StartsWith(term)) ||
                     (o.Customer != null && o.Customer.City.StartsWith(term)) ||
                     (o.Customer != null && o.Customer.District.StartsWith(term)) ||
                     (o.Customer != null && o.Customer.Address.StartsWith(term)))));
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

        // Georgian-name lookups (active records only) + the shared entity→DTO mapping.
        AdminOrderListMapper.GeoNames geo = await AdminOrderListMapper.LoadGeoNamesAsync(_context, cancellationToken);
        bool hideRevenue = request.TenantId.HasValue || request.HideCompanyRevenue;

        var items = entities
            .Select(o => AdminOrderListMapper.ToDto(o, geo, hideRevenue))
            .ToList();

        return new PagedResult<AdminOrderListDto>(items, totalCount, request.Page, request.PageSize);
    }
}
