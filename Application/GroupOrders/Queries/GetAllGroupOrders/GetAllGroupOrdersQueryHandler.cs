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

    // The Packages page runs this query twice per refresh with identical filters and only
    // Page/PageSize differing (a paginated view + an up-to-500-row "window scoped" view used
    // to detect same-day merge candidates). "Phase 1" below — the free-text search scan — has
    // no Skip/Take, so both calls pay its full cost. Cache the id list it produces (keyed on
    // every filter except Page/PageSize) for a few seconds so the second call reuses it.
    private sealed record Phase1Row(Guid Id, DateTime CreatedAt);
    private sealed record Phase1Result(List<Phase1Row> GoRows, List<Phase1Row> SoRows);
    private static readonly TimeSpan Phase1CacheDuration = TimeSpan.FromSeconds(5);

    private static string BuildPhase1CacheKey(GetAllGroupOrdersQuery r) =>
        $"grouporders:phase1:{r.SearchTerm}|{r.Date:O}|{r.DateTo:O}|{r.Cities}|{r.Districts}|" +
        $"{r.Party}|{r.Status}|{r.CourierId}|{r.Unpriced}|{r.ExcludeCompleted}|{r.CustomerId}";

    private readonly IAppDbContext _context;
    private readonly ICacheService _cache;
    public GetAllGroupOrdersQueryHandler(IAppDbContext context, ICacheService cache)
    {
        _context = context;
        _cache = cache;
    }

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
            // Party = "recipient" restricts the search to each order's own recipient fields
            // (name/phone/address/city/district) — sender/pickup fields are excluded so a
            // recipient-side search never matches on the sender's name. Party = "sender"
            // restricts to sender/pickup fields. Otherwise (null) it matches either side.
            // The tracking number is a unique identifier, so it always matches regardless of
            // the party scope (this is what lets a deep-link/"Go To" find an order by TN).
            var matchesSender    = request.Party != "recipient";
            var matchesRecipient = request.Party != "sender";

            goQuery = goQuery.Where(go =>
                (matchesSender &&
                    (go.SenderFirstName.ToLower().Contains(term) ||
                     go.SenderLastName.ToLower().Contains(term) ||
                     go.SenderBusinessName.ToLower().Contains(term) ||
                     go.SenderPhone.Contains(term) ||
                     (go.AlternativeSenderPhone != null && go.AlternativeSenderPhone.Contains(term)) ||
                     go.PickUpCity.ToLower().Contains(term) ||
                     go.PickUpDistrict.ToLower().Contains(term) ||
                     go.PickUpAddress.ToLower().Contains(term)))
                ||
                (matchesRecipient &&
                    go.Orders.Any(o =>
                        o.RecipientName.ToLower().Contains(term) ||
                        o.RecipientPhone.Contains(term) ||
                        o.RecipientCity.ToLower().Contains(term) ||
                        o.RecipientDistrict.ToLower().Contains(term) ||
                        o.RecipientAddress.ToLower().Contains(term)))
                ||
                go.Orders.Any(o => o.TrackingNumber.ToLower().Contains(term))
            );

            soQuery = soQuery.Where(o =>
                (matchesRecipient &&
                    (o.RecipientName.ToLower().Contains(term) ||
                     o.RecipientPhone.Contains(term) ||
                     o.RecipientCity.ToLower().Contains(term) ||
                     o.RecipientDistrict.ToLower().Contains(term) ||
                     o.RecipientAddress.ToLower().Contains(term)))
                ||
                (matchesSender && o.Customer != null &&
                    (o.Customer.BusinessName.ToLower().Contains(term) ||
                     o.Customer.FirstName.ToLower().Contains(term) ||
                     o.Customer.LastName.ToLower().Contains(term) ||
                     o.Customer.PhoneNumber.Contains(term) ||
                     o.Customer.City.ToLower().Contains(term) ||
                     o.Customer.District.ToLower().Contains(term) ||
                     o.Customer.Address.ToLower().Contains(term)))
                ||
                o.TrackingNumber.ToLower().Contains(term)
            );
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

        // ── Customer (History page filter) — GroupOrder.CustomerId for batches,
        //    Order.CustomerId directly for standalone orders. ──────────────────────────
        if (request.CustomerId is Guid customerId)
        {
            goQuery = goQuery.Where(go => go.CustomerId == customerId);
            soQuery = soQuery.Where(o => o.CustomerId == customerId);
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

        // ── Merge-paginate over lightweight (Id, CreatedAt) rows ──────────────────
        // goQuery/soQuery are unpaginated and share the exact predicates used above, so
        // the row counts double as the totals — no need for two extra CountAsync round
        // trips against the same (non-concurrent-safe) DbContext.
        // This is the expensive step when a free-text search is active (the Contains() scan
        // above can't use an index) — cache it briefly so the paginated + window-scoped calls
        // the Packages page fires for the same filters don't each pay for it separately.
        var phase1CacheKey = BuildPhase1CacheKey(request);
        var phase1 = await _cache.GetAsync<Phase1Result>(phase1CacheKey, cancellationToken);
        if (phase1 is null)
        {
            var goRowsFresh = await goQuery
                .Select(go => new Phase1Row(go.Id, go.CreatedAt))
                .ToListAsync(cancellationToken);
            var soRowsFresh = await soQuery
                .Select(o => new Phase1Row(o.Id, o.CreatedAt))
                .ToListAsync(cancellationToken);
            phase1 = new Phase1Result(goRowsFresh, soRowsFresh);
            await _cache.SetAsync(phase1CacheKey, phase1, Phase1CacheDuration, cancellationToken);
        }
        var goRows = phase1.GoRows;
        var soRows = phase1.SoRows;
        var totalCount = goRows.Count + soRows.Count;

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

        var (cityGeo, districtGeo) = await GroupOrderMapping.BuildGeoLookupsAsync(_context, _cache, cancellationToken);

        var items = groupOrders.Select(go => GroupOrderMapping.MapGroupOrder(go, cityGeo, districtGeo))
            .Concat(standalone.Select(o => GroupOrderMapping.MapStandalone(o, cityGeo, districtGeo)))
            .OrderByDescending(dto => dto.CreatedAt)
            .ToList();

        return new PagedResult<AdminGroupOrderDto>(items, totalCount, request.Page, request.PageSize);
    }
}
