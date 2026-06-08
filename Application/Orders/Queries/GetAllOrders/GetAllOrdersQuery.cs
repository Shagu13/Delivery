using Application.Common.Models;
using MediatR;

namespace Application.Orders.Queries.GetAllOrders;

public sealed record GetAllOrdersQuery(
    string? City,
    string? District,
    string? Search,
    Guid?   CourierId,
    string? OrderType  = null,   // "Send" | "Return" | "Exchange" | null (all)
    bool    Unpriced   = false,
    bool    ActiveOnly = false,  // when true, exclude terminal statuses
    bool    Postponed  = false,  // when true, show only DeliveryPostponed orders
    int     Page       = 1,
    int     PageSize   = 50,
    bool?   Assigned   = null    // null = all, true = courier assigned, false = unassigned
) : IRequest<PagedResult<AdminOrderListDto>>;
