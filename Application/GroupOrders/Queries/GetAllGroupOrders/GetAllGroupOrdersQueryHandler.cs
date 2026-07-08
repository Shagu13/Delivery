using Application.Common.Interfaces;
using Application.Common.Models;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetAllGroupOrders;

public sealed class GetAllGroupOrdersQueryHandler
    : IRequestHandler<GetAllGroupOrdersQuery, PagedResult<AdminGroupOrderDto>>
{
    private static readonly OrderStatus[] CancelledStatuses =
    {
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    // Hiding rule mirrors client/src/utils/groupOrderUtils.ts's isCompletedGroupOrder —
    // fully completed batches/orders belong in History, not this list.
    private static readonly OrderStatus[] TerminalGroupOrderStatuses =
    {
        OrderStatus.CancelledBySender,
        OrderStatus.CancelledByAdmin,
        OrderStatus.OrderNotAccepted,
        OrderStatus.AllDelivered,
    };
    private static readonly OrderStatus[] TerminalOrderStatuses =
    {
        OrderStatus.DeliveredToRecipient,
        OrderStatus.CancelledBySender,
        OrderStatus.CancelledByAdmin,
        OrderStatus.OrderNotAccepted,
        OrderStatus.ReturnedToSender,
        OrderStatus.ExchangeCompleted,
    };

    // Statuses that live on individual orders rather than the GroupOrder itself — mirrors
    // client/src/pages/Admin/AdminDashboard.tsx's ORDER_LEVEL_STATUSES.
    private static readonly OrderStatus[] OrderLevelStatuses =
    {
        OrderStatus.OrderIsOnItsWayToRecipientsCity,
        OrderStatus.CourierAssignedToDeliver,
        OrderStatus.CourierDeliveringTheOrderToRecipient,
        OrderStatus.DeliveredToRecipient,
        OrderStatus.CancelledByAdmin,
    };

    private readonly IAppDbContext _context;
    public GetAllGroupOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<PagedResult<AdminGroupOrderDto>> Handle(
        GetAllGroupOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var cities = string.IsNullOrWhiteSpace(request.Cities)
            ? new HashSet<string>()
            : request.Cities.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet();
        var districts = string.IsNullOrWhiteSpace(request.Districts)
            ? new HashSet<string>()
            : request.Districts.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet();
        var recipientParty = request.Party == "recipient";
        OrderStatus? statusFilter = !string.IsNullOrWhiteSpace(request.Status) && Enum.TryParse<OrderStatus>(request.Status, out var parsed)
            ? parsed
            : null;

        // ── Phase 1: cheap, filtered — no Include() graphs yet ────────────────────
        var goQuery = _context.GroupOrders.AsNoTracking();
        var soQuery = _context.Orders
            .AsNoTracking()
            .Where(o => o.GroupOrderId == null && o.CustomerId != null && !CancelledStatuses.Contains(o.Status));

        // Pick-Up page opts in to hide fully completed batches/orders — they live in
        // History instead. Other consumers (History itself, dashboard summaries) need
        // the full set, so this is opt-in rather than always-on.
        if (request.ExcludeCompleted)
        {
            goQuery = goQuery.Where(go =>
                !TerminalGroupOrderStatuses.Contains(go.Status) &&
                !(go.Orders.Any() && !go.Orders.Any(o => !TerminalOrderStatuses.Contains(o.Status))));
            soQuery = soQuery.Where(o =>
                !TerminalGroupOrderStatuses.Contains(o.Status) &&
                !TerminalOrderStatuses.Contains(o.Status));
        }

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var term = request.SearchTerm.Trim().ToLower();
            goQuery = goQuery.Where(go =>
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

            soQuery = soQuery.Where(o =>
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

        // ── Date window (sargable — same style as the Packages/Orders fix) ────────
        if (request.Date.HasValue)
        {
            var from = request.Date.Value.Date;
            var to   = (request.DateTo ?? request.Date).Value.Date.AddDays(1);
            goQuery = goQuery.Where(go => go.CreatedAt >= from && go.CreatedAt < to);
            soQuery = soQuery.Where(o  => o.CreatedAt  >= from && o.CreatedAt  < to);
        }

        // ── City / District (sender = pickup side, recipient = each child order) ──
        if (recipientParty)
        {
            if (cities.Count > 0)
                goQuery = goQuery.Where(go => go.Orders.Any(o => cities.Contains(o.RecipientCity)));
            if (districts.Count > 0)
                goQuery = goQuery.Where(go => go.Orders.Any(o => districts.Contains(o.RecipientDistrict)));

            if (cities.Count > 0)
                soQuery = soQuery.Where(o => cities.Contains(o.RecipientCity));
            if (districts.Count > 0)
                soQuery = soQuery.Where(o => districts.Contains(o.RecipientDistrict));
        }
        else
        {
            if (cities.Count > 0)
                goQuery = goQuery.Where(go => cities.Contains(go.PickUpCity));
            if (districts.Count > 0)
                goQuery = goQuery.Where(go => districts.Contains(go.PickUpDistrict));

            if (cities.Count > 0)
                soQuery = soQuery.Where(o => o.Customer != null && cities.Contains(o.Customer.City));
            if (districts.Count > 0)
                soQuery = soQuery.Where(o => o.Customer != null && districts.Contains(o.Customer.District));
        }

        // ── Status (order-level statuses match any child order; batch-level match the
        //    GroupOrder itself — standalone orders always match on their own Status) ──
        if (statusFilter is OrderStatus status)
        {
            soQuery = soQuery.Where(o => o.Status == status);
            goQuery = OrderLevelStatuses.Contains(status)
                ? goQuery.Where(go => go.Orders.Any(o => o.Status == status))
                : goQuery.Where(go => go.Status == status);
        }

        // ── Delivery courier (last-mile Order.CourierId — distinct from the GroupOrder's own
        //    pickup courier) — keep a batch if any child order is assigned to them. ──────────
        if (request.CourierId is Guid courierId)
        {
            goQuery = goQuery.Where(go => go.Orders.Any(o => o.CourierId == courierId));
            soQuery = soQuery.Where(o => o.CourierId == courierId);
        }

        // ── Unpriced (missing financials) — mirrors GetAllOrdersQuery's Delivery-page
        //    definition so both pages agree on what "unpriced" means. ─────────────────────
        if (request.Unpriced)
        {
            goQuery = goQuery.Where(go => go.Orders.Any(o =>
                o.CompanyServicePrice == 0 || o.CourierSalary == null || o.CourierSalary == 0));
            soQuery = soQuery.Where(o =>
                o.CompanyServicePrice == 0 || o.CourierSalary == null || o.CourierSalary == 0);
        }

        // ── Count + merge-paginate over lightweight (Id, CreatedAt) rows ──────────
        var goCount = await goQuery.CountAsync(cancellationToken);
        var soCount = await soQuery.CountAsync(cancellationToken);
        var totalCount = goCount + soCount;

        var goRows = await goQuery
            .Select(go => new { go.Id, go.CreatedAt })
            .ToListAsync(cancellationToken);
        var soRows = await soQuery
            .Select(o => new { o.Id, o.CreatedAt })
            .ToListAsync(cancellationToken);

        var pageIds = goRows.Select(x => (x.Id, x.CreatedAt, IsStandalone: false))
            .Concat(soRows.Select(x => (x.Id, x.CreatedAt, IsStandalone: true)))
            .OrderByDescending(x => x.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToList();

        var pageGoIds = pageIds.Where(x => !x.IsStandalone).Select(x => x.Id).ToHashSet();
        var pageSoIds = pageIds.Where(x => x.IsStandalone).Select(x => x.Id).ToHashSet();

        // ── Phase 2: hydrate full Include() graphs — only for this page's ids ────
        var groupOrders = pageGoIds.Count == 0
            ? new List<GroupOrder>()
            : await _context.GroupOrders
                .Include(go => go.Orders)
                .Include(go => go.Courier)
                .Include(go => go.Customer)
                .AsNoTracking()
                .Where(go => pageGoIds.Contains(go.Id))
                .ToListAsync(cancellationToken);

        var standalone = pageSoIds.Count == 0
            ? new List<Order>()
            : await _context.Orders
                .Include(o => o.Customer)
                .Include(o => o.Courier)
                .AsNoTracking()
                .Where(o => pageSoIds.Contains(o.Id))
                .ToListAsync(cancellationToken);

        var (cityGeo, districtGeo) = await GroupOrderMapping.BuildGeoLookupsAsync(_context, cancellationToken);

        var items = groupOrders.Select(go => GroupOrderMapping.MapGroupOrder(go, cityGeo, districtGeo))
            .Concat(standalone.Select(o => GroupOrderMapping.MapStandalone(o, cityGeo, districtGeo)))
            .OrderByDescending(dto => dto.CreatedAt)
            .ToList();

        return new PagedResult<AdminGroupOrderDto>(items, totalCount, request.Page, request.PageSize);
    }
}
