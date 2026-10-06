using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

// ── Customer: own payment receipts, by paid date ──────────────────────────────────
public sealed record GetMyPaymentReceiptsQuery(
    string    CustomerUserId,
    DateOnly? Date,
    bool      Monthly = false,
    DateOnly? From    = null,
    DateOnly? To      = null
) : IRequest<IReadOnlyList<PaymentReceiptDto>>;

public sealed class GetMyPaymentReceiptsQueryHandler
    : IRequestHandler<GetMyPaymentReceiptsQuery, IReadOnlyList<PaymentReceiptDto>>
{
    private readonly IAppDbContext _context;
    public GetMyPaymentReceiptsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<PaymentReceiptDto>> Handle(
        GetMyPaymentReceiptsQuery request, CancellationToken ct)
    {
        var customer = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CustomerUserId, ct)
            ?? throw new NotFoundException("Customer", request.CustomerUserId);

        // Skip receipts that only settle staff-created walk-in office packages — those are
        // never part of the customer's own portal. Admins still see them via the admin read.
        var query = PaymentReceiptQueries.FilterByPaidAt(
            PaymentReceiptQueries.Base(_context)
                .Where(p => p.CustomerId == customer.Id)
                .Where(p => p.Allocations.Any(a => a.Order == null || !a.Order.IsWalkIn)),
            request.Date, request.Monthly, request.From, request.To)
            .OrderByDescending(p => p.PaidAt);

        var receipts = await query.ToListAsync(ct);
        return receipts.Select(PaymentReceiptQueries.ToDto).ToList();
    }
}

// ── Admin: a customer's payment receipts, by paid date ─────────────────────────────
public sealed record GetCustomerPaymentReceiptsQuery(
    Guid      CustomerId,
    DateOnly? Date,
    bool      Monthly = false,
    DateOnly? From    = null,
    DateOnly? To      = null
) : IRequest<IReadOnlyList<PaymentReceiptDto>>;

public sealed class GetCustomerPaymentReceiptsQueryHandler
    : IRequestHandler<GetCustomerPaymentReceiptsQuery, IReadOnlyList<PaymentReceiptDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomerPaymentReceiptsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<PaymentReceiptDto>> Handle(
        GetCustomerPaymentReceiptsQuery request, CancellationToken ct)
    {
        _ = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, ct)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        var query = PaymentReceiptQueries.FilterByPaidAt(
            PaymentReceiptQueries.Base(_context).Where(p => p.CustomerId == request.CustomerId),
            request.Date, request.Monthly, request.From, request.To)
            .OrderByDescending(p => p.PaidAt);

        var receipts = await query.ToListAsync(ct);
        return receipts.Select(PaymentReceiptQueries.ToDto).ToList();
    }
}

// ── Shared shaping + mapping ──────────────────────────────────────────────────────
internal static class PaymentReceiptQueries
{
    public static IQueryable<PaymentReceipt> Base(IAppDbContext context) =>
        context.PaymentReceipts
            .AsNoTracking()
            .Include(p => p.Courier)
            .Include(p => p.Allocations).ThenInclude(a => a.Order!).ThenInclude(o => o.Courier);

    /// <summary>
    /// Narrows by paid date (PaidAt). A from/to range (inclusive, either bound optional)
    /// takes precedence over a single <paramref name="date"/>; <paramref name="monthly"/>
    /// widens that date to its whole calendar month. No date and no range → no narrowing.
    /// </summary>
    public static IQueryable<PaymentReceipt> FilterByPaidAt(
        IQueryable<PaymentReceipt> query, DateOnly? date, bool monthly = false, DateOnly? from = null, DateOnly? to = null)
    {
        if (from is not null || to is not null)
        {
            if (from is DateOnly f)
                query = query.Where(p => p.PaidAt >= f.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
            if (to is DateOnly t)
                query = query.Where(p => p.PaidAt < t.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
            return query;
        }
        if (date is not DateOnly d) return query;
        DateTime start, end;
        if (monthly) { start = new DateTime(d.Year, d.Month, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddMonths(1); }
        else         { start = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);           end = start.AddDays(1); }
        return query.Where(p => p.PaidAt >= start && p.PaidAt < end);
    }

    public static PaymentReceiptDto ToDto(PaymentReceipt p) => new(
        Id:          p.Id,
        IsService:   p.IsService,
        TotalAmount: p.TotalAmount,
        PaidAt:      p.PaidAt.ToString("o"),
        Flow:        p.Flow,
        CourierId:   p.CourierId,
        CourierName: p.Courier is null ? null : $"{p.Courier.FirstName} {p.Courier.LastName}",
        Orders:     p.Allocations.Select(a => new PaymentReceiptOrderDto(
            OrderId:          a.OrderId,
            TrackingNumber:   a.Order?.TrackingNumber ?? string.Empty,
            RecipientName:    a.Order?.RecipientName ?? string.Empty,
            RecipientAddress: a.Order is null
                ? string.Empty
                : string.Join(", ", new[] { a.Order.RecipientAddress, a.Order.RecipientDistrict, a.Order.RecipientCity }
                    .Where(s => !string.IsNullOrWhiteSpace(s))),
            DeliveredAt:      (a.Order?.DeliveredAt ?? a.Order?.DeliveredToWarehouseAt)?.ToString("o"),
            CourierName:      a.Order?.Courier is null ? null : $"{a.Order.Courier.FirstName} {a.Order.Courier.LastName}",
            Amount:           a.Amount
        )).ToList()
    );
}
