using Application.Common.Models;
using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Queries.GetAllGroupOrders;

/// <summary>
/// Paginated, newest-first feed of group orders (real batches) and standalone orders
/// (surfaced as synthetic single-order batches), each with its child orders.
/// </summary>
/// <param name="SearchTerm">Free-text match across sender/recipient/tracking fields.</param>
/// <param name="Date">Range start (Georgian day). Null with <see cref="DateTo"/> null → no date bound.</param>
/// <param name="DateTo">Range end (inclusive). Null → single day = <see cref="Date"/>.</param>
/// <param name="Cities">Comma-separated recipient/pickup cities (per <see cref="Party"/>); any match.</param>
/// <param name="Districts">Comma-separated recipient/pickup districts (per <see cref="Party"/>); any match.</param>
/// <param name="Party">"sender" (default) matches the pickup side; "recipient" matches each child order's recipient.</param>
/// <param name="Status">A GroupOrder-level status, or one of the order-level statuses (matches any child order).</param>
/// <param name="CourierId">Delivery courier (Order.CourierId, last-mile) — matches any child order.</param>
/// <param name="Unpriced">Missing financials — matches any child order with no company service
/// price or no courier salary set (mirrors GetAllOrdersQuery's Delivery-page definition).</param>
/// <param name="ExcludeCompleted">
/// The Pick-Up page hides fully completed batches/orders (they live in History instead) —
/// opt-in only, since History and other consumers of this query need the full set.
/// </param>
/// <param name="CustomerId">Owning customer — GroupOrder.CustomerId for batches, Order.CustomerId
/// for standalone orders (History page's customer filter).</param>
public sealed record GetAllGroupOrdersQuery(
    string?   SearchTerm,
    DateTime? Date             = null,
    DateTime? DateTo           = null,
    string?   Cities           = null,
    string?   Districts        = null,
    string    Party            = "sender",
    string?   Status           = null,
    Guid?     CourierId        = null,
    bool      Unpriced         = false,
    bool      ExcludeCompleted = false,
    int       Page             = 1,
    int       PageSize         = 30,
    Guid?     CustomerId       = null
) : IRequest<PagedResult<AdminGroupOrderDto>>;
