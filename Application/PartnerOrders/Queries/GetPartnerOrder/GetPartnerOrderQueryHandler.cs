using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.PartnerOrders.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerOrders.Queries.GetPartnerOrder;

public sealed class GetPartnerOrderQueryHandler
    : IRequestHandler<GetPartnerOrderQuery, PartnerOrderDetailDto>
{
    private readonly IAppDbContext _context;

    public GetPartnerOrderQueryHandler(IAppDbContext context) => _context = context;

    public async Task<PartnerOrderDetailDto> Handle(
        GetPartnerOrderQuery request,
        CancellationToken cancellationToken)
    {
        var reference = request.Reference.Trim();

        var order = await _context.Orders
            .AsNoTracking()
            .Include(o => o.TrackingEvents.OrderBy(e => e.CreatedAt))
            .Where(o => o.GroupOrder!.CustomerId == request.CustomerId
                     || o.CustomerId == request.CustomerId)
            .FirstOrDefaultAsync(
                o => o.TrackingNumber == reference || o.ExternalReference == reference,
                cancellationToken)
            ?? throw new NotFoundException("Order", reference);

        var status = PartnerOrderStatusMapper.Map(order.Status);

        var events = order.TrackingEvents
            .Select(e => new PartnerTrackingEventDto(
                PartnerOrderStatusMapper.TryMap(e.Status),
                e.Description,
                e.CreatedAt))
            .ToList();

        return new PartnerOrderDetailDto(
            TrackingNumber:            order.TrackingNumber,
            ExternalReference:         order.ExternalReference,
            Status:                    status,
            StatusCode:                (int)status,
            RecipientName:             order.RecipientName,
            RecipientPhone:            order.RecipientPhone,
            RecipientCity:             order.RecipientCity,
            RecipientDistrict:         order.RecipientDistrict,
            RecipientAddress:          order.RecipientAddress,
            IsFragile:                 order.IsFragile,
            Description:               order.Description,
            ProductPaymentStatus:      order.ProductPaymentStatus,
            WhoPaysForCompanyService:  order.WhoPaysForCompanyService,
            AmountToCollectForPackage: order.AmountToCollectForPackage,
            CompanyServicePrice:       order.CompanyServicePrice,
            CreatedAt:                 order.CreatedAt,
            DeliveredAt:               order.DeliveredAt ?? order.DeliveredToWarehouseAt,
            TrackingEvents:            events);
    }
}
