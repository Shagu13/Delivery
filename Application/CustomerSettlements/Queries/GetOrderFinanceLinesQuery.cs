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
// Two modes. Default view: the same row-shaping and effective-date rule
// (DeliveredAt ?? DeliveredToWarehouseAt ?? CreatedAt) as the admin's
// GetCustomerOrderFinanceLinesQuery, so a customer and an admin looking at the same
// date/range see the same orders and the same totals (walk-in packages aside — those
// stay admin-only). Payments view (<see cref="PaymentsMode"/>): only orders whose COD
// payout has been recorded (paid), narrowed to those paid on <see cref="Date"/> — a
// customer-only view with no admin equivalent. The mode is explicit so an empty date
// never leaks unpaid orders into the payments view.
public sealed record GetMyOrderFinanceLinesQuery(
    string    CustomerUserId,
    DateOnly? Date,
    bool      PaymentsMode,
    bool      Monthly = false,
    DateOnly? From    = null,
    DateOnly? To      = null
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

        // Staff-created walk-in office packages never appear in the customer's own finance
        // page; admins still see and settle them through GetCustomerOrderFinanceLinesQuery.
        // includeActiveLastMile: the customer's own page additionally surfaces orders still
        // in the last-mile pipeline (accepted in warehouse through delivery-postponed) so the
        // COD summary can show expected, not-yet-collected COD alongside delivered-outstanding.
        var query = OrderFinanceQueries.ForFinanceReporting(
                        OrderFinanceQueries.ForCustomer(_context, customer.Id), includeActiveLastMile: true)
                                       .Where(o => !o.IsWalkIn);

        if (request.PaymentsMode)
        {
            query = OrderFinanceQueries.FilterByCodPaidAt(query, request.Date, request.Monthly, request.From, request.To)
                                       .OrderByDescending(o => o.CodPaidToCustomerAt);
        }
        else
        {
            // Same effective-date rule as the admin read, so the same date/range selects
            // the same orders on both pages.
            query = (request.From is not null || request.To is not null)
                ? OrderFinanceQueries.FilterByEffectiveDateRange(query, request.From, request.To)
                : OrderFinanceQueries.FilterByEffectiveDate(query, request.Date, request.Monthly);
            query = query.OrderByDescending(o => o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CreatedAt);
        }

        var orders = await query.ToListAsync(ct);
        return orders.Select(OrderFinanceQueries.ToDto).ToList();
    }
}

// ── Admin: a customer's order lines, dated by delivery ────────────────────────────
/// <summary>
/// When <paramref name="From"/>/<paramref name="To"/> are supplied they take precedence over
/// <paramref name="Date"/>/<paramref name="Monthly"/> and narrow to an inclusive effective-date
/// range (both ends included).
/// </summary>
public sealed record GetCustomerOrderFinanceLinesQuery(
    Guid      CustomerId,
    DateOnly? Date,
    bool      Monthly = false,
    DateOnly? From    = null,
    DateOnly? To      = null
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

        var query = OrderFinanceQueries.ForFinanceReporting(
            OrderFinanceQueries.ForCustomer(_context, request.CustomerId));

        // Date by delivery when delivered, else by placement (for the not-yet-delivered
        // sender-paid orders) so both slot into the day/month navigation. A from/to range
        // (when given) takes precedence over the single day/month.
        query = (request.From is not null || request.To is not null)
            ? OrderFinanceQueries.FilterByEffectiveDateRange(query, request.From, request.To)
            : OrderFinanceQueries.FilterByEffectiveDate(query, request.Date, request.Monthly);
        query = query.OrderByDescending(o => o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CreatedAt);

        var orders = await query.ToListAsync(ct);
        return orders.Select(OrderFinanceQueries.ToDto).ToList();
    }
}

// ── Admin: every customer's order lines for a date/range, dated by delivery ───────
/// <summary>
/// Same inclusion rules as <see cref="GetCustomerOrderFinanceLinesQuery"/> (delivered, or
/// sender-pays-and-accepted, or billable failed delivery, or cancelled — for transparency)
/// but across every customer, for the date-first admin Finance grid. The caller groups the
/// flat result by <c>CustomerId</c>.
/// </summary>
public sealed record GetAllCustomersOrderFinanceLinesQuery(
    DateOnly? Date,
    bool      Monthly = false,
    DateOnly? From    = null,
    DateOnly? To      = null
) : IRequest<IReadOnlyList<OrderFinanceLineDto>>;

public sealed class GetAllCustomersOrderFinanceLinesQueryHandler
    : IRequestHandler<GetAllCustomersOrderFinanceLinesQuery, IReadOnlyList<OrderFinanceLineDto>>
{
    private readonly IAppDbContext _context;
    public GetAllCustomersOrderFinanceLinesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<OrderFinanceLineDto>> Handle(
        GetAllCustomersOrderFinanceLinesQuery request, CancellationToken ct)
    {
        var query = OrderFinanceQueries.ForFinanceReporting(
            OrderFinanceQueries.Base(_context, includeCancelled: true));

        query = (request.From is not null || request.To is not null)
            ? OrderFinanceQueries.FilterByEffectiveDateRange(query, request.From, request.To)
            : OrderFinanceQueries.FilterByEffectiveDate(query, request.Date, request.Monthly);
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

    /// <summary>Last-mile statuses between warehouse acceptance and delivery (inclusive of the
    /// postpone loop). Used by <see cref="ForFinanceReporting"/> to surface an order's expected
    /// COD before it's delivered, regardless of who pays the service fee.</summary>
    private static readonly OrderStatus[] ActiveLastMileStatuses =
    {
        OrderStatus.AdminAcceptedOrderInWareHouse,
        OrderStatus.OrderIsOnItsWayToRecipientsCity,
        OrderStatus.CourierAssignedToDeliver,
        OrderStatus.CourierDeliveringTheOrderToRecipient,
        OrderStatus.DeliveryPostponed,
    };

    /// <summary>
    /// Orders with the navigations needed for mapping. By default: active (non-cancelled) orders
    /// plus billable failed deliveries (mirrors OrderFinance.IsBillableFailedDelivery; inlined
    /// because this composes into SQL) — the sender still owes their fee / the courier their salary.
    /// When <paramref name="includeCancelled"/> is true, ALL cancelled orders are also returned so
    /// the customer/admin finance lists can show them (with "—" amounts + reason) for transparency.
    /// The courier view keeps the default (false) — couriers never see non-billable cancellations.
    /// </summary>
    public static IQueryable<Order> Base(IAppDbContext context, bool includeCancelled = false) =>
        context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder)!.ThenInclude(g => g!.Customer)
            .Include(o => o.Customer)
            .Where(o => includeCancelled
                     || !CancelledStatuses.Contains(o.Status)
                     || (o.OrderType != OrderType.Return
                         && o.CancellationReason != null
                         && o.CancellationReason != CancellationReason.WarehouseNotReceived
                         && o.CancellationReason != CancellationReason.DidNotWant));

    /// <summary>Orders owned by a customer via either ownership path, including cancelled ones
    /// (shown with "—" amounts in the finance lists for transparency).</summary>
    public static IQueryable<Order> ForCustomer(IAppDbContext context, Guid customerId) =>
        Base(context, includeCancelled: true).Where(o => o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId);

    /// <summary>
    /// Shapes an already-scoped order set (one customer, or every customer) down to what a
    /// customer↔company finance list should ever show. Include an order when EITHER:
    ///   • it is delivered (its COD payout / service settlement is final), OR
    ///   • the sender pays the service fee and the order has been accepted (status past
    ///     Pending) but not cancelled — so the customer can settle that fee in advance, before
    ///     delivery, at any stage of the flow (customers often pre-pay), OR
    ///   • it is a billable failed delivery — the sender owes the fee even though it never
    ///     delivered (mirrors OrderFinance.IsBillableFailedDelivery), OR
    ///   • it is cancelled (shown with "—" amounts + reason, for transparency), OR
    ///   • (when <paramref name="includeActiveLastMile"/>) it is undelivered but already past
    ///     warehouse acceptance and has a package COD amount — surfaced so a "not yet delivered,
    ///     expected COD" figure can be shown regardless of who pays the service fee.
    /// Then drops orders with no company↔customer settlement at all: the recipient pays the
    /// service fee (nothing invoiced to the sender) and there is no package COD for the
    /// company to pay back. Billable failed deliveries and cancelled orders are kept regardless.
    /// </summary>
    public static IQueryable<Order> ForFinanceReporting(IQueryable<Order> query, bool includeActiveLastMile = false)
    {
        query = query.Where(o =>
            (o.DeliveredAt ?? o.DeliveredToWarehouseAt) != null
            || (o.WhoPaysForCompanyService == ServicePayer.Sender && o.Status != OrderStatus.Pending)
            || (includeActiveLastMile && ActiveLastMileStatuses.Contains(o.Status) && o.AmountToCollectForPackage != null)
            || (o.OrderType != OrderType.Return
                && o.CancellationReason != null
                && o.CancellationReason != CancellationReason.WarehouseNotReceived
                && o.CancellationReason != CancellationReason.DidNotWant)
            || o.Status == OrderStatus.CancelledByAdmin
            || o.Status == OrderStatus.CancelledBySender
            || o.Status == OrderStatus.OrderNotAccepted
            || o.Status == OrderStatus.DeliveryPostponed);

        return query.Where(o => !(o.WhoPaysForCompanyService == ServicePayer.Recipient
                                && o.AmountToCollectForPackage == null)
                              || (o.OrderType != OrderType.Return
                                  && o.CancellationReason != null
                                  && o.CancellationReason != CancellationReason.WarehouseNotReceived
                                  && o.CancellationReason != CancellationReason.DidNotWant)
                              || o.Status == OrderStatus.CancelledByAdmin
                              || o.Status == OrderStatus.CancelledBySender
                              || o.Status == OrderStatus.OrderNotAccepted
                              || o.Status == OrderStatus.DeliveryPostponed);
    }

    /// <summary>
    /// Orders whose COD payout to the customer was recorded — i.e. paid orders. Narrows by the
    /// payment date (CodPaidToCustomerAt): a from/to range (inclusive) takes precedence over a
    /// single <paramref name="date"/>; <paramref name="monthly"/> widens it to the whole month.
    /// </summary>
    public static IQueryable<Order> FilterByCodPaidAt(
        IQueryable<Order> query, DateOnly? date, bool monthly = false, DateOnly? from = null, DateOnly? to = null)
    {
        query = query.Where(o => o.IsCollectedCodPaidToCustomer
                              && o.CodPaidToCustomerAt != null
                              && o.CodPaidToCustomerAmount != null);

        if (from is not null || to is not null)
        {
            if (from is DateOnly f)
                query = query.Where(o => o.CodPaidToCustomerAt >= f.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
            if (to is DateOnly t)
                query = query.Where(o => o.CodPaidToCustomerAt < t.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
            return query;
        }
        if (date is not DateOnly d) return query;
        DateTime start, end;
        if (monthly) { start = new DateTime(d.Year, d.Month, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddMonths(1); }
        else         { start = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);           end = start.AddDays(1); }
        return query.Where(o => o.CodPaidToCustomerAt >= start && o.CodPaidToCustomerAt < end);
    }

    /// <summary>
    /// Delivery-dated views (admin + courier) only ever show <b>delivered</b> orders —
    /// those with a delivery timestamp (last-mile DeliveredAt or return drop-off
    /// DeliveredToWarehouseAt). When a date is given, narrows to that single day.
    /// </summary>
    public static IQueryable<Order> FilterByDeliveredAt(IQueryable<Order> query, DateOnly? date)
    {
        // CancelledAt covers billable failed deliveries (courier earns salary) that have no
        // delivery timestamp; Base() has already limited the set to active + billable orders,
        // so the only cancelled orders here are billable ones.
        query = query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CancelledAt) != null);

        if (date is not DateOnly d) return query;
        var start = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var end   = start.AddDays(1);
        return query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CancelledAt) >= start
                             && (o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CancelledAt) <  end);
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

    /// <summary>
    /// Narrows to an inclusive effective-date range [from, to] (either bound optional). Dates an
    /// order by its delivery timestamp when delivered, else by placement — matching
    /// <see cref="FilterByEffectiveDate"/>. "23 to 26" includes both the 23rd and the 26th.
    /// </summary>
    public static IQueryable<Order> FilterByEffectiveDateRange(IQueryable<Order> query, DateOnly? from, DateOnly? to)
    {
        if (from is DateOnly f)
        {
            var start = f.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            query = query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CreatedAt) >= start);
        }
        if (to is DateOnly tt)
        {
            var end = tt.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc); // inclusive upper bound
            query = query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CreatedAt) < end);
        }
        return query;
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
            IsCompanyServicePaid:         OrderFinance.IsCompanyServicePaid(o),
            SenderOwesService:            OrderFinance.SenderOwesService(o),
            IsBillableFailedDelivery:     OrderFinance.IsBillableFailedDelivery(o),
            CancellationReason:           o.CancellationReason?.ToString(),
            CancellationComment:          o.CancellationComment,
            PostponeComment:              o.PostponeComment,
            OrderNote:                    o.GroupOrder?.Note,
            Description:                  o.Description
        );
    }
}
