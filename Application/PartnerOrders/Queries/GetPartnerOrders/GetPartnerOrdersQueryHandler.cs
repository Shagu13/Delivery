using Application.Common.Interfaces;
using Application.PartnerOrders.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerOrders.Queries.GetPartnerOrders;

public sealed class GetPartnerOrdersQueryHandler
    : IRequestHandler<GetPartnerOrdersQuery, PartnerOrderListDto>
{
    private readonly IAppDbContext _context;

    public GetPartnerOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<PartnerOrderListDto> Handle(
        GetPartnerOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var page     = request.Page     < 1 ? 1  : request.Page;
        var pageSize = request.PageSize is < 1 or > 200 ? 50 : request.PageSize;

        // Partner sees only their own orders (both ownership paths per domain rule).
        var query = _context.Orders
            .AsNoTracking()
            .Where(o => o.GroupOrder!.CustomerId == request.CustomerId
                     || o.CustomerId == request.CustomerId);

        if (request.Status is { } status)
        {
            var internalStatuses = PartnerOrderStatusMapper.ToInternal(status);
            query = query.Where(o => internalStatuses.Contains(o.Status));
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim();
            query = query.Where(o =>
                o.TrackingNumber.Contains(term) ||
                (o.ExternalReference != null && o.ExternalReference.Contains(term)) ||
                o.RecipientName.Contains(term) ||
                o.RecipientPhone.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);

        // Project translatable fields first, then map the public status in memory.
        var rows = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(o => new
            {
                o.TrackingNumber,
                o.ExternalReference,
                o.Status,
                o.RecipientName,
                o.RecipientCity,
                o.RecipientDistrict,
                o.RecipientAddress,
                o.ProductPaymentStatus,
                o.WhoPaysForCompanyService,
                o.AmountToCollectForPackage,
                o.CompanyServicePrice,
                o.CreatedAt,
                Delivered = o.DeliveredAt ?? o.DeliveredToWarehouseAt,
            })
            .ToListAsync(cancellationToken);

        var items = rows.Select(o =>
        {
            var status = PartnerOrderStatusMapper.Map(o.Status);
            return new PartnerOrderSummaryDto(
                TrackingNumber:            o.TrackingNumber,
                ExternalReference:         o.ExternalReference,
                Status:                    status,
                StatusCode:                (int)status,
                RecipientName:             o.RecipientName,
                RecipientCity:             o.RecipientCity,
                RecipientDistrict:         o.RecipientDistrict,
                RecipientAddress:          o.RecipientAddress,
                ProductPaymentStatus:      o.ProductPaymentStatus,
                WhoPaysForCompanyService:  o.WhoPaysForCompanyService,
                AmountToCollectForPackage: o.AmountToCollectForPackage,
                CompanyServicePrice:       o.CompanyServicePrice,
                CreatedAt:                 o.CreatedAt,
                DeliveredAt:               o.Delivered);
        }).ToList();

        return new PartnerOrderListDto(total, page, pageSize, items);
    }
}
