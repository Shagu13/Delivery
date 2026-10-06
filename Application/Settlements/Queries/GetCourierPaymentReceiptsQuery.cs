using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using Application.CustomerSettlements.Queries;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Queries;

/// <summary>
/// Courier payment receipts (salary paid / COD hand-over), by paid date. Admin passes an
/// optional <paramref name="CourierId"/> (null = every courier); the courier's own read
/// always passes their JWT courier id.
/// </summary>
public sealed record GetCourierPaymentReceiptsQuery(
    Guid?     CourierId,
    DateOnly? Date,
    bool      Monthly = false,
    DateOnly? From    = null,
    DateOnly? To      = null
) : IRequest<IReadOnlyList<PaymentReceiptDto>>;

public sealed class GetCourierPaymentReceiptsQueryHandler
    : IRequestHandler<GetCourierPaymentReceiptsQuery, IReadOnlyList<PaymentReceiptDto>>
{
    private readonly IAppDbContext _context;
    public GetCourierPaymentReceiptsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<PaymentReceiptDto>> Handle(
        GetCourierPaymentReceiptsQuery request, CancellationToken ct)
    {
        IQueryable<Domain.PaymentReceipt> query = PaymentReceiptQueries.Base(_context)
            .Where(p => p.CourierId != null);

        if (request.CourierId is Guid courierId)
            query = query.Where(p => p.CourierId == courierId);

        List<Domain.PaymentReceipt> receipts = await PaymentReceiptQueries
            .FilterByPaidAt(query, request.Date, request.Monthly, request.From, request.To)
            .OrderByDescending(p => p.PaidAt)
            .ToListAsync(ct);

        return receipts.Select(PaymentReceiptQueries.ToDto).ToList();
    }
}
