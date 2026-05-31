using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Finance.Queries;

// ── DTO ───────────────────────────────────────────────────────────────────────

/// <summary>
/// A single order where the company service fee has not yet been collected
/// (CompanyServicePaymentStatus == Unpaid or Pending).
/// </summary>
public sealed record UnpaidFeeOrderDto(
    Guid      OrderId,
    string    TrackingNumber,

    // Sender / customer info
    Guid?     CustomerId,
    string    SenderFirstName,
    string    SenderLastName,
    string    SenderBusinessName,
    string    SenderPhone,
    /// <summary>Registered phone on the Customer account (may differ from SenderPhone on the order).</summary>
    string?   CustomerPhone,

    // Recipient info
    string    RecipientFirstName,
    string    RecipientLastName,
    string    RecipientPhone,
    string    RecipientCity,

    // Fee info
    decimal   CompanyServicePrice,
    string    WhoPaysForCompanyService,   // "Sender" | "Recipient"
    string    CompanyServicePaymentStatus, // "Unpaid" | "Pending"

    // Delivery
    string    OrderStatus,
    DateTime? DeliveredAt,
    DateTime  CreatedAt
);

// ── Query ─────────────────────────────────────────────────────────────────────

public sealed record GetUnpaidFeeOrdersQuery : IRequest<IReadOnlyList<UnpaidFeeOrderDto>>;

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class GetUnpaidFeeOrdersQueryHandler
    : IRequestHandler<GetUnpaidFeeOrdersQuery, IReadOnlyList<UnpaidFeeOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetUnpaidFeeOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<UnpaidFeeOrderDto>> Handle(
        GetUnpaidFeeOrdersQuery request,
        CancellationToken cancellationToken)
    {
        var orders = await _context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder).ThenInclude(g => g.Customer)
            .Where(o => o.CompanyServicePaymentStatus == CompanyServicePaymentStatus.Unpaid
                     || o.CompanyServicePaymentStatus == CompanyServicePaymentStatus.Pending)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(cancellationToken);

        return orders.Select(o => new UnpaidFeeOrderDto(
            OrderId:                    o.Id,
            TrackingNumber:             o.TrackingNumber,
            CustomerId:                 o.GroupOrder.CustomerId,
            SenderFirstName:            o.GroupOrder.SenderFirstName,
            SenderLastName:             o.GroupOrder.SenderLastName,
            SenderBusinessName:         o.GroupOrder.SenderBusinessName,
            SenderPhone:                o.GroupOrder.SenderPhone,
            CustomerPhone:              o.GroupOrder.Customer?.PhoneNumber,
            RecipientFirstName:         o.RecipientFirstName,
            RecipientLastName:          o.RecipientLastName,
            RecipientPhone:             o.RecipientPhone,
            RecipientCity:              o.RecipientCity,
            CompanyServicePrice:        o.CompanyServicePrice,
            WhoPaysForCompanyService:   o.WhoPaysForCompanyService.ToString(),
            CompanyServicePaymentStatus: o.CompanyServicePaymentStatus.ToString(),
            OrderStatus:                o.Status.ToString(),
            DeliveredAt:                o.DeliveredAt,
            CreatedAt:                  o.CreatedAt
        )).ToList();
    }
}
