using Application.Common.Models;
using MediatR;

namespace Application.Orders.Queries.GetAllOrders;

public sealed record GetAllOrdersQuery(
    string? City,
    string? District,
    string? Search,
    Guid?   CourierId,
    bool    Unpriced = false,
    int     Page     = 1,
    int     PageSize = 50
) : IRequest<PagedResult<AdminOrderListDto>>;
