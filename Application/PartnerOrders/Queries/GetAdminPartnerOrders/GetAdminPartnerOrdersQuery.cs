using Application.Common.Models;
using Application.PartnerOrders.DTOs;
using MediatR;

namespace Application.PartnerOrders.Queries.GetAdminPartnerOrders;

/// <summary>
/// System-admin "Partner Orders" page: every order created through the Partner API
/// (<c>Order.IsPartnerApiOrder</c>), newest first. Optional filters: one partner
/// (customer), a free-text search, and a created-at Georgian-day range (inclusive).
/// </summary>
public sealed record GetAdminPartnerOrdersQuery(
    Guid? CustomerId,
    string? Search,
    DateTime? From,
    DateTime? To,
    int Page,
    int PageSize
) : IRequest<PagedResult<AdminPartnerOrderDto>>;
