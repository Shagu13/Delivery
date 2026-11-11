using Application.Common.Interfaces;
using Application.Common.Models;
using Application.PartnerOrders.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerOrders.Queries.GetAdminPartnerOrders;

public sealed class GetAdminPartnerOrdersQueryHandler
    : IRequestHandler<GetAdminPartnerOrdersQuery, PagedResult<AdminPartnerOrderDto>>
{
    private readonly IAppDbContext _context;

    public GetAdminPartnerOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<PagedResult<AdminPartnerOrderDto>> Handle(
        GetAdminPartnerOrdersQuery request,
        CancellationToken cancellationToken)
    {
        int page     = request.Page < 1 ? 1 : request.Page;
        int pageSize = request.PageSize is < 1 or > 200 ? 50 : request.PageSize;

        IQueryable<Domain.Order> query = _context.Orders
            .AsNoTracking()
            .Where(o => o.IsPartnerApiOrder);

        // Partner API orders are always Send orders inside a batch, but OR both ownership
        // paths per the domain rule so this never silently misses a row.
        if (request.CustomerId is Guid customerId)
            query = query.Where(o => o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId);

        // Stored values are Georgian wall-clock, so plain date bounds are correct.
        if (request.From is DateTime from)
            query = query.Where(o => o.CreatedAt >= from.Date);
        if (request.To is DateTime to)
            query = query.Where(o => o.CreatedAt < to.Date.AddDays(1));

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            string term = request.Search.Trim();
            query = query.Where(o =>
                o.TrackingNumber.Contains(term) ||
                (o.ExternalReference != null && o.ExternalReference.Contains(term)) ||
                o.RecipientName.Contains(term) ||
                o.RecipientPhone.Contains(term));
        }

        int total = await query.CountAsync(cancellationToken);

        List<AdminPartnerOrderDto> items = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(o => new AdminPartnerOrderDto(
                o.Id,
                o.TrackingNumber,
                o.ExternalReference,
                o.GroupOrder != null ? o.GroupOrder.CustomerId : o.CustomerId,
                o.GroupOrder != null && o.GroupOrder.Customer != null
                    ? o.GroupOrder.Customer.BusinessName
                    : o.Customer != null ? o.Customer.BusinessName : "",
                o.Status,
                o.RecipientName,
                o.RecipientPhone,
                o.RecipientCity,
                o.RecipientDistrict,
                o.ProductPaymentStatus,
                o.WhoPaysForCompanyService,
                o.AmountToCollectForPackage,
                o.CompanyServicePrice,
                o.CreatedAt,
                o.DeliveredAt ?? o.DeliveredToWarehouseAt))
            .ToListAsync(cancellationToken);

        return new PagedResult<AdminPartnerOrderDto>(items, total, page, pageSize);
    }
}
