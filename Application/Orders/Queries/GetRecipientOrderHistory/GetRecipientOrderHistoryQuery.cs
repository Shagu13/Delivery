using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.GetRecipientOrderHistory;

/// <summary>One past order to a given recipient phone — the Recipients directory drill-down.</summary>
public sealed record RecipientOrderHistoryDto(
    Guid        Id,
    string      TrackingNumber,
    OrderType   OrderType,
    OrderStatus Status,
    DateTime    CreatedAt,
    /// <summary>Send/Exchange complete at DeliveredAt; Returns at DeliveredToWarehouseAt.</summary>
    DateTime?   CompletedAt,
    /// <summary>The sending customer's business name, or full name when they have none set.</summary>
    string      SenderDisplayName,
    string      RecipientCity,
    string      RecipientDistrict,
    string      RecipientAddress
);

/// <summary>
/// Every order sent to one recipient phone, most recent first — company-wide (not scoped to
/// a single customer), since different senders can share a recipient. Powers the drill-down
/// from a Recipients directory row.
/// </summary>
public sealed record GetRecipientOrderHistoryQuery(string Phone) : IRequest<IReadOnlyList<RecipientOrderHistoryDto>>;

public sealed class GetRecipientOrderHistoryQueryHandler
    : IRequestHandler<GetRecipientOrderHistoryQuery, IReadOnlyList<RecipientOrderHistoryDto>>
{
    private readonly IAppDbContext _context;
    public GetRecipientOrderHistoryQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<RecipientOrderHistoryDto>> Handle(
        GetRecipientOrderHistoryQuery request,
        CancellationToken             cancellationToken)
    {
        var phone = request.Phone.Trim();

        var rows = await _context.Orders.AsNoTracking()
            .Where(o => o.RecipientPhone == phone)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new
            {
                o.Id, o.TrackingNumber, o.OrderType, o.Status, o.CreatedAt,
                o.DeliveredAt, o.DeliveredToWarehouseAt,
                o.RecipientCity, o.RecipientDistrict, o.RecipientAddress,
                SenderBusinessName = o.GroupOrder != null ? o.GroupOrder.Customer!.BusinessName : o.Customer!.BusinessName,
                SenderFirstName    = o.GroupOrder != null ? o.GroupOrder.Customer!.FirstName    : o.Customer!.FirstName,
                SenderLastName     = o.GroupOrder != null ? o.GroupOrder.Customer!.LastName     : o.Customer!.LastName,
            })
            .Take(200)
            .ToListAsync(cancellationToken);

        return rows
            .Select(o => new RecipientOrderHistoryDto(
                o.Id,
                o.TrackingNumber,
                o.OrderType,
                o.Status,
                o.CreatedAt,
                o.DeliveredAt ?? o.DeliveredToWarehouseAt,
                !string.IsNullOrWhiteSpace(o.SenderBusinessName) ? o.SenderBusinessName : $"{o.SenderFirstName} {o.SenderLastName}".Trim(),
                o.RecipientCity,
                o.RecipientDistrict,
                o.RecipientAddress))
            .ToList();
    }
}
