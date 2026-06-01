using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries;

public sealed class GetReturnExchangeOrdersQueryHandler
    : IRequestHandler<GetReturnExchangeOrdersQuery, IReadOnlyList<ReturnExchangeOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetReturnExchangeOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<ReturnExchangeOrderDto>> Handle(
        GetReturnExchangeOrdersQuery request, CancellationToken ct)
    {
        var orders = await _context.Orders
            .AsNoTracking()
            .Include(o => o.Courier)
            .Include(o => o.Customer)
            .Include(o => o.GroupOrder)
            .Where(o => o.OrderType == OrderType.Return || o.OrderType == OrderType.Exchange)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(ct);

        return orders.Select(o =>
        {
            // For standalone Return orders CustomerId is required; for group Exchange orders use GroupOrder
            var senderName  = o.Customer?.BusinessName ?? o.GroupOrder?.SenderBusinessName ?? "";
            var senderPhone = o.Customer?.PhoneNumber  ?? o.GroupOrder?.SenderPhone        ?? "";

            return new ReturnExchangeOrderDto(
                Id:                      o.Id,
                TrackingNumber:          o.TrackingNumber,
                OrderType:               o.OrderType.ToString(),
                Status:                  o.Status.ToString(),
                SenderName:              senderName,
                SenderPhone:             senderPhone,
                CustomerId:              o.CustomerId ?? o.GroupOrder?.CustomerId,
                RecipientFirstName:      o.RecipientFirstName,
                RecipientLastName:       o.RecipientLastName,
                RecipientPhone:          o.RecipientPhone,
                RecipientCity:           o.RecipientCity,
                RecipientDistrict:       o.RecipientDistrict,
                RecipientAddress:        o.RecipientAddress,
                ReturnPickupCity:        o.ReturnPickupCity,
                ReturnPickupDistrict:    o.ReturnPickupDistrict,
                ReturnPickupAddress:     o.ReturnPickupAddress,
                CourierId:               o.CourierId,
                CourierFullName:         o.Courier is null ? null : $"{o.Courier.FirstName} {o.Courier.LastName}",
                CourierPhone:            o.Courier?.PhoneNumber,
                CompanyServicePrice:     o.CompanyServicePrice,
                CreatedAt:               o.CreatedAt,
                PickedUpFromRecipientAt: o.PickedUpFromRecipientAt,
                DeliveredToWarehouseAt:  o.DeliveredToWarehouseAt,
                DeliveredAt:             o.DeliveredAt
            );
        }).ToList();
    }
}
