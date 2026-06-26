using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using Application.Finance;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

// ── Customer: own order lines ─────────────────────────────────────────────────────
// Two modes. Placement view (default): all the customer's orders, optionally narrowed
// to those placed on <see cref="Date"/>. Payments view (<see cref="PaymentsMode"/>):
// only orders whose COD payout has been recorded (paid), optionally narrowed to those
// paid on <see cref="Date"/>. The mode is explicit so an empty date never leaks unpaid
// orders into the payments view.
public sealed record GetMyOrderFinanceLinesQuery(
    string    CustomerUserId,
    DateOnly? Date,
    bool      PaymentsMode
) : IRequest<IReadOnlyList<OrderFinanceLineDto>>;

public sealed class GetMyOrderFinanceLinesQueryHandler
    : IRequestHandler<GetMyOrderFinanceLinesQuery, IReadOnlyList<OrderFinanceLineDto>>
{
    private readonly IAppDbContext _context;
    public GetMyOrderFinanceLinesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<OrderFinanceLineDto>> Handle(
        GetMyOrderFinanceLinesQuery request, CancellationToken ct)
    {
        var customer = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CustomerUserId, ct)
            ?? throw new NotFoundException("Customer", request.CustomerUserId);

        var query = OrderFinanceQueries.ForCustomer(_context, customer.Id);

        if (request.PaymentsMode)
            query = OrderFinanceQueries.FilterByCodPaidAt(query, request.Date)
                                       .OrderByDescending(o => o.CodPaidToCustomerAt);
        else
            query = OrderFinanceQueries.FilterByCreatedAt(query, request.Date)
                                       .OrderByDescending(o => o.CreatedAt);

        var orders = await query.ToListAsync(ct);
        return orders.Select(OrderFinanceQueries.ToDto).ToList();
    }
}

// ── Admin: a customer's order lines, dated by delivery ────────────────────────────
public sealed record GetCustomerOrderFinanceLinesQuery(
    Guid      CustomerId,
    DateOnly? Date,
    bool      Monthly = false
) : IRequest<IReadOnlyList<OrderFinanceLineDto>>;

public sealed class GetCustomerOrderFinanceLinesQueryHandler
    : IRequestHandler<GetCustomerOrderFinanceLinesQuery, IReadOnlyList<OrderFinanceLineDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomerOrderFinanceLinesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<OrderFinanceLineDto>> Handle(
        GetCustomerOrderFinanceLinesQuery request, CancellationToken ct)
    {
        _ = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, ct)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        var query = OrderFinanceQueries.ForCustomer(_context, request.CustomerId);

        // Include an order when EITHER:
        //   • it is delivered (its COD payout / service settlement is final), OR
        //   • the sender pays the service fee and the order has been accepted (status past
        //     Pending) but not cancelled — so the customer can settle that fee in advance,
        //     before delivery, at any stage of the flow. (Customers often pre-pay.)
        query = query.Where(o =>
            (o.DeliveredAt ?? o.DeliveredToWarehouseAt) != null
            || (o.WhoPaysForCompanyService == ServicePayer.Sender && o.Status != OrderStatus.Pending));

        // Drop orders with no company↔customer settlement: the recipient pays the
        // service fee (nothing invoiced to the sender) and there is no package COD
        // for the company to pay back.
        query = query.Where(o => !(o.WhoPaysForCompanyService == ServicePayer.Recipient
                                && o.AmountToCollectForPackage == null));

        // Date by delivery when delivered, else by placement (for the not-yet-delivered
        // sender-paid orders) so both slot into the day/month navigation.
        query = OrderFinanceQueries.FilterByEffectiveDate(query, request.Date, request.Monthly);
        query = query.OrderByDescending(o => o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CreatedAt);

        var orders = await query.ToListAsync(ct);
        return orders.Select(OrderFinanceQueries.ToDto).ToList();
    }
}

// ── Courier: own delivered order lines, dated by delivery ─────────────────────────
public sealed record GetCourierOrderFinanceLinesQuery(
    Guid      CourierId,
    DateOnly? Date
) : IRequest<IReadOnlyList<OrderFinanceLineDto>>;

public sealed class GetCourierOrderFinanceLinesQueryHandler
    : IRequestHandler<GetCourierOrderFinanceLinesQuery, IReadOnlyList<OrderFinanceLineDto>>
{
    private readonly IAppDbContext _context;
    public GetCourierOrderFinanceLinesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<OrderFinanceLineDto>> Handle(
        GetCourierOrderFinanceLinesQuery request, CancellationToken ct)
    {
        var query = OrderFinanceQueries.Base(_context)
            .Where(o => o.CourierId == request.CourierId);
        query = OrderFinanceQueries.FilterByDeliveredAt(query, request.Date)
                                   .OrderByDescending(o => o.DeliveredAt ?? o.DeliveredToWarehouseAt);

        var orders = await query.ToListAsync(ct);
        return orders.Select(OrderFinanceQueries.ToDto).ToList();
    }
}

// ── Shared shaping + mapping ──────────────────────────────────────────────────────
internal static class OrderFinanceQueries
{
    private static readonly OrderStatus[] CancelledStatuses =
    {
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    /// <summary>Active (non-cancelled) orders with the navigations needed for mapping.</summary>
    public static IQueryable<Order> Base(IAppDbContext context) =>
        context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder)!.ThenInclude(g => g!.Customer)
            .Include(o => o.Customer)
            .Where(o => !CancelledStatuses.Contains(o.Status));

    /// <summary>Active orders owned by a customer via either ownership path.</summary>
    public static IQueryable<Order> ForCustomer(IAppDbContext context, Guid customerId) =>
        Base(context).Where(o => o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId);

    public static IQueryable<Order> FilterByCreatedAt(IQueryable<Order> query, DateOnly? date)
    {
        if (date is not DateOnly d) return query;
        var start = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var end   = start.AddDays(1);
        return query.Where(o => o.CreatedAt >= start && o.CreatedAt < end);
    }

    /// <summary>
    /// Orders whose COD payout to the customer was recorded — i.e. paid orders. When a
    /// date is given, narrows to payments made on that single day (by CodPaidToCustomerAt).
    /// </summary>
    public static IQueryable<Order> FilterByCodPaidAt(IQueryable<Order> query, DateOnly? date)
    {
        query = query.Where(o => o.IsCollectedCodPaidToCustomer
                              && o.CodPaidToCustomerAt != null
                              && o.CodPaidToCustomerAmount != null);

        if (date is not DateOnly d) return query;
        var start = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var end   = start.AddDays(1);
        return query.Where(o => o.CodPaidToCustomerAt >= start && o.CodPaidToCustomerAt < end);
    }

    /// <summary>
    /// Delivery-dated views (admin + courier) only ever show <b>delivered</b> orders —
    /// those with a delivery timestamp (last-mile DeliveredAt or return drop-off
    /// DeliveredToWarehouseAt). When a date is given, narrows to that single day.
    /// </summary>
    public static IQueryable<Order> FilterByDeliveredAt(IQueryable<Order> query, DateOnly? date)
    {
        query = query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt) != null);

        if (date is not DateOnly d) return query;
        var start = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var end   = start.AddDays(1);
        return query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt) >= start
                             && (o.DeliveredAt ?? o.DeliveredToWarehouseAt) <  end);
    }

    /// <summary>
    /// Like <see cref="FilterByDeliveredAt"/> but narrows to the whole calendar month
    /// of the given date (its day component is ignored). No date → all delivered orders.
    /// </summary>
    public static IQueryable<Order> FilterByDeliveredMonth(IQueryable<Order> query, DateOnly? date)
    {
        query = query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt) != null);

        if (date is not DateOnly d) return query;
        var start = new DateTime(d.Year, d.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var end   = start.AddMonths(1);
        return query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt) >= start
                             && (o.DeliveredAt ?? o.DeliveredToWarehouseAt) <  end);
    }

    /// <summary>
    /// Dates an order by its delivery timestamp when delivered, else by its placement date
    /// (CreatedAt). Used by the admin customer view, which also surfaces not-yet-delivered
    /// sender-paid orders — those have no delivery date so they fall back to when placed.
    /// No date → no narrowing; <paramref name="monthly"/> → the whole calendar month.
    /// </summary>
    public static IQueryable<Order> FilterByEffectiveDate(IQueryable<Order> query, DateOnly? date, bool monthly)
    {
        if (date is not DateOnly d) return query;

        DateTime start, end;
        if (monthly)
        {
            start = new DateTime(d.Year, d.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            end   = start.AddMonths(1);
        }
        else
        {
            start = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            end   = start.AddDays(1);
        }
        return query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CreatedAt) >= start
                             && (o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CreatedAt) <  end);
    }

    public static OrderFinanceLineDto ToDto(Order o)
    {
        bool     isReturn   = o.GroupOrderId is null;
        Customer? customer  = o.GroupOrder?.Customer ?? o.Customer;
        Guid     customerId = o.GroupOrder?.CustomerId ?? o.CustomerId ?? Guid.Empty;

        return new OrderFinanceLineDto(
            OrderId:                      o.Id,
            TrackingNumber:               o.TrackingNumber,
            RecipientName:                o.RecipientName,
            RecipientCity:                o.RecipientCity,
            RecipientDistrict:            o.RecipientDistrict,
            RecipientAddress:             o.RecipientAddress,
            OrderType:                    o.OrderType.ToString(),
            Status:                       o.Status.ToString(),
            ProductPaymentStatus:         o.ProductPaymentStatus.ToString(),
            IsReturn:                     isReturn,
            CustomerId:                   customerId,
            CustomerBusinessName:         customer?.BusinessName ?? string.Empty,
            CreatedAt:                    o.CreatedAt.ToString("o"),
            DeliveredAt:                  (o.DeliveredAt ?? o.DeliveredToWarehouseAt)?.ToString("o"),
            CodAmount:                    o.AmountToCollectForPackage,
            IsCollectedCodPaidToCustomer: o.IsCollectedCodPaidToCustomer,
            CodPaidToCustomerAmount:      o.CodPaidToCustomerAmount,
            CodPaidToCustomerAt:          o.CodPaidToCustomerAt?.ToString("o"),
            CompanyServicePrice:          o.CompanyServicePrice,
            WhoPaysForCompanyService:     o.WhoPaysForCompanyService.ToString(),
            CompanyServicePaymentStatus:  o.CompanyServicePaymentStatus.ToString(),
            ServicePaidByCustomerAmount:  o.ServicePaidByCustomerAmount,
            ServicePaidByCustomerAt:      o.ServicePaidByCustomerAt?.ToString("o"),
            CourierSalary:                o.CourierSalary,
            AmountOfCashCollected:        o.AmountOfCashCollected,

            CourierSalaryPaidAmount:           o.CourierSalaryPaidAmount,
            CourierSalaryPaidAt:               o.CourierSalaryPaidAt?.ToString("o"),
            IsCourierSalaryPaid:               OrderFinance.IsCourierSalaryPaid(o),
            CodTransferedToCompanyByCourier:   o.CodTransferedToCompanyByCourier,
            CodTransferedToCompanyByCourierAt: o.CodTransferedToCompanyByCourierAt?.ToString("o"),
            HasCourierTransferedAmount:        OrderFinance.HasCourierTransferedAmount(o),

            CompanyRevenue:               OrderFinance.CompanyRevenue(o),
            CompanyNetCash:               OrderFinance.CompanyNetCash(o),
            IsCompanyServicePaid:         OrderFinance.IsCompanyServicePaid(o)
        );
    }
}
