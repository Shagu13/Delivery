using Application.PartnerOrders.DTOs;
using MediatR;

namespace Application.PartnerOrders.Queries.GetPartnerOrders;

/// <summary>
/// Lists a partner's own orders (newest first), optionally filtered by public status
/// or a free-text search over tracking number / external reference / recipient.
/// </summary>
public sealed record GetPartnerOrdersQuery(
    Guid CustomerId,
    PartnerOrderStatus? Status,
    string? Search,
    int Page,
    int PageSize
) : IRequest<PartnerOrderListDto>;
