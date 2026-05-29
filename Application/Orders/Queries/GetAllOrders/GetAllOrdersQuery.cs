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
    int     Page       = 1,
    int     PageSize   = 50
) : IRequest<PagedResult<AdminOrderListDto>>;
