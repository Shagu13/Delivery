using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using Application.Finance;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Builds per-batch customer invoice rows live by grouping a customer's orders — one row
/// per GroupOrder (Send/Exchange batch) or per standalone Return order. Replaces the
/// removed CustomerSettlement table; figures are derived from the batch's active
/// (non-cancelled) orders and the per-order payment fields admins record on the finance page.
/// </summary>
internal static class CustomerSettlementProjection
{
    private static readonly OrderStatus[] CancelledStatuses =
    {
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    private static readonly OrderStatus[] DeliveredStatuses =
    {
        OrderStatus.DeliveredToRecipient,
        OrderStatus.ExchangeCompleted,
        OrderStatus.DeliveredReturnOrderToWarehouse,
        OrderStatus.ReturnedToSender,
    };

    /// <summary>
    /// Billable orders owned by the customer via either ownership path, with navs. Includes
    /// active (non-cancelled) orders plus billable failed deliveries (courier-declined or
    /// admin-cancelled after reaching a delivery courier) — the sender still owes their fee.
    /// </summary>
    private static async Task<List<Order>> LoadActiveAsync(
        IAppDbContext context, Guid customerId, bool excludeWalkIn, CancellationToken ct) =>
        await context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder)
            .Where(o => (o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId)
                     && (!excludeWalkIn || !o.IsWalkIn)
                     && (!CancelledStatuses.Contains(o.Status)
                         // Billable failed delivery (see OrderFinance.IsBillableFailedDelivery):
                         // an explicit (non-warehouse) CancellationReason was recorded when the
                         // courier/admin cancelled-and-charged or returned to sender. ReturnedToSender
                         // already passes the line above; the cancelled terminals are re-included here.
                         || (o.OrderType != OrderType.Return
                             && o.CancellationReason != null
                             && o.CancellationReason != CancellationReason.WarehouseNotReceived
                             && o.CancellationReason != CancellationReason.DidNotWant)))
            .ToListAsync(ct);

    /// <summary>
    /// The customer's per-batch invoice rows, newest first, optionally narrowed to a placement day.
    /// <paramref name="excludeWalkIn"/> drops staff-created walk-in office packages — set by the
    /// customer-facing "my" read; the admin read keeps them so they can still be settled.
    /// </summary>
    public static async Task<IReadOnlyList<CustomerSettlementDto>> ForCustomerAsync(
        IAppDbContext context, Guid customerId, string businessName, DateOnly? date,
        CancellationToken ct, bool excludeWalkIn = false)
    {
        var active = await LoadActiveAsync(context, customerId, excludeWalkIn, ct);
        var rows   = BuildRows(active, customerId, businessName);

        if (date is DateOnly d)
        {
            var start = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var end   = start.AddDays(1);
            rows = rows.Where(r =>
            {
                var created = DateTime.Parse(r.CreatedAt, null, System.Globalization.DateTimeStyles.RoundtripKind);
                return created >= start && created < end;
            }).ToList();
        }

        return rows;
    }

    /// <summary>Groups active orders into invoice rows. Batches by GroupOrderId; standalone Returns are individual rows.</summary>
    private static List<CustomerSettlementDto> BuildRows(
        IReadOnlyCollection<Order> active, Guid customerId, string businessName)
    {
        var rows = new List<CustomerSettlementDto>();

        // Send/Exchange batches.
        foreach (var grp in active.Where(o => o.GroupOrderId != null).GroupBy(o => o.GroupOrderId!.Value))
        {
            var go = grp.First().GroupOrder!;
            rows.Add(BuildRow(
                id: grp.Key, customerId, businessName,
                groupOrderId: grp.Key, orderId: null, isReturn: false,
                numberOfPackages: go.NumberOfPackages,
                status: go.Status.ToString(),
                createdAt: go.CreatedAt,
                orders: grp.ToList()));
        }

        // Standalone orders — one row each; only those whose sender owes the company a fee
        // (sender-pays returns, or a billable failed delivery) carry a company↔customer invoice.
        foreach (var ret in active.Where(o => o.GroupOrderId == null
                                           && (OrderFinance.SenderOwesService(o) || OrderFinance.SenderServiceShare(o) > 0m)))
        {
            rows.Add(BuildRow(
                id: ret.Id, customerId, businessName,
                groupOrderId: null, orderId: ret.Id, isReturn: true,
                numberOfPackages: 1,
                status: ret.Status.ToString(),
                createdAt: ret.CreatedAt,
                orders: new[] { ret }));
        }

        return rows.OrderByDescending(r => r.CreatedAt).ToList();
    }

    private static CustomerSettlementDto BuildRow(
        Guid id, Guid customerId, string businessName,
        Guid? groupOrderId, Guid? orderId, bool isReturn,
        int numberOfPackages, string status, DateTime createdAt, IReadOnlyCollection<Order> orders)
    {
        int delivered = orders.Count(o => DeliveredStatuses.Contains(o.Status));

        // A billable failed delivery collected no COD (nothing handed over), so it contributes
        // nothing to the COD the company holds for the customer — only a service-fee receivable.
        decimal cod        = orders.Where(o => !OrderFinance.IsBillableFailedDelivery(o))
                                   .Sum(o => o.AmountToCollectForPackage ?? 0m);
        decimal codPaid    = orders.Sum(o => o.CodPaidToCustomerAmount ?? 0m);

        // The sender's share of the fee: the whole fee on sender-pays orders, only the surcharge on
        // recipient-pays ones (0 for an ordinary recipient-pays order, so it contributes nothing).
        var senderOwes     = orders.Where(o => OrderFinance.SenderOwesService(o) || OrderFinance.SenderServiceShare(o) > 0m).ToList();
        decimal service    = senderOwes.Sum(OrderFinance.SenderServiceShare);
        decimal servicePaid = senderOwes.Sum(o => o.ServicePaidByCustomerAmount ?? 0m);

        DateTime? updated = orders
            .SelectMany(o => new[] { o.CodPaidToCustomerAt, o.ServicePaidByCustomerAt })
            .Where(t => t != null)
            .DefaultIfEmpty(null)
            .Max();

        return new CustomerSettlementDto(
            Id:                                        id,
            CustomerId:                                customerId,
            CustomerBusinessName:                      businessName,
            GroupOrderId:                              groupOrderId,
            OrderId:                                   orderId,
            IsReturn:                                  isReturn,
            NumberOfPackages:                          numberOfPackages,
            Status:                                    status,
            TotalNumberOfOrdersPlaced:                 orders.Count,
            TotalNumberOfOrderDelivered:               delivered,
            TotalCODCompanyCollectedForPackages:       cod,
            TotalAmountOfCollectedCodPaidByCompany:    codPaid,
            AmountOfCollectedCodPaidByCompany:         codPaid,
            OutstandingCodOwedToCustomer:              cod - codPaid,
            TotalCompanyServicePriceOwedToCompany:     service,
            TotalAmountPaidToCompanyForCompanyService: servicePaid,
            AmountPaidToCompanyForCompanyService:      servicePaid,
            OutstandingServiceOwedToCompany:           service - servicePaid,
            CreatedAt:                                 createdAt.ToString("o"),
            UpdatedAt:                                 updated?.ToString("o"));
    }
}
