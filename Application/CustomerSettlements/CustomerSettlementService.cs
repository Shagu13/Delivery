using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements;

/// <summary>
/// Shared computation + mapping for per-batch customer invoices, so the create,
/// recompute and read paths stay in lock-step. One invoice row exists per
/// GroupOrder (Send/Exchange batch) or per standalone Return order; figures are
/// derived from the batch's active (non-cancelled) orders.
/// </summary>
internal static class CustomerSettlementService
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

    /// <summary>The four order-derived figures for a batch.</summary>
    public readonly record struct Figures(
        int OrdersPlaced,
        int OrdersDelivered,
        decimal CodCollectedForPackages,
        decimal CompanyServicePriceOwed);

    /// <summary>
    /// Computes counts + money figures over the batch's <b>active</b> (non-cancelled)
    /// orders: COD = Σ AmountToCollectForPackage (company owes the customer); service
    /// owed = Σ CompanyServicePrice where the sender pays the fee (customer owes company).
    /// </summary>
    private static Figures ComputeFigures(IReadOnlyCollection<Order> orders)
    {
        var active = orders.Where(o => !CancelledStatuses.Contains(o.Status)).ToList();

        int delivered = active.Count(o => DeliveredStatuses.Contains(o.Status));
        decimal cod = active.Sum(o => o.AmountToCollectForPackage ?? 0m);
        decimal service = active
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender)
            .Sum(o => o.CompanyServicePrice);

        return new Figures(active.Count, delivered, cod, service);
    }

    /// <summary>
    /// Dispatches to the batch or standalone-return upsert based on the order's link.
    /// Used by the delivery / edit / cancel handlers to keep the invoice in sync.
    /// </summary>
    public static async Task UpsertForOrderAsync(IAppDbContext context, Order order, CancellationToken ct)
    {
        if (order.GroupOrderId.HasValue)
            await UpsertForGroupOrderAsync(context, order.GroupOrderId.Value, ct);
        else
            await UpsertForReturnOrderAsync(context, order, ct);
    }

    /// <summary>
    /// Creates or recomputes the invoice for a Send/Exchange batch. No-op when the
    /// batch has no customer or no orders. Soft-deletes (DateDeleted) when no active
    /// orders remain (whole batch cancelled); revives otherwise.
    /// </summary>
    public static async Task UpsertForGroupOrderAsync(IAppDbContext context, Guid groupOrderId, CancellationToken ct)
    {
        var group = await context.GroupOrders
            .Include(g => g.Orders)
            .FirstOrDefaultAsync(g => g.Id == groupOrderId, ct);

        if (group is null || group.CustomerId is null || group.Orders.Count == 0) return;

        var figures  = ComputeFigures(group.Orders.ToList());
        var existing = await context.CustomerSettlements
            .FirstOrDefaultAsync(s => s.GroupOrderId == groupOrderId, ct);

        CustomerSettlement settlement;
        if (existing is null)
        {
            settlement = new CustomerSettlement
            {
                GroupOrderId                          = groupOrderId,
                CustomerId                            = group.CustomerId.Value,
                CreatedAt                             = group.CreatedAt,
                TotalNumberOfOrdersPlaced             = figures.OrdersPlaced,
                TotalNumberOfOrderDelivered           = figures.OrdersDelivered,
                TotalCODCompanyCollectedForPackages   = figures.CodCollectedForPackages,
                TotalCompanyServicePriceOwedToCompany = figures.CompanyServicePriceOwed,
                DateDeleted                           = figures.OrdersPlaced == 0 ? DateTime.UtcNow : null,
            };
            context.CustomerSettlements.Add(settlement);
        }
        else
        {
            ApplyFigures(existing, figures);
            settlement = existing;
        }

        // Keep per-order paid/unpaid flags in lock-step with the recomputed balance.
        ApplyServicePaymentStatus(settlement, group.Orders);

        await context.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Creates or recomputes the invoice for a standalone Return order. Only acts when
    /// the sender (customer) pays the service fee — that is the only money the customer
    /// owes for a return. Recipient-paid or cancelled returns hold no invoice; an
    /// existing one is soft-deleted.
    /// </summary>
    public static async Task UpsertForReturnOrderAsync(IAppDbContext context, Order order, CancellationToken ct)
    {
        if (order.CustomerId is null) return;

        var existing = await context.CustomerSettlements
            .FirstOrDefaultAsync(s => s.OrderId == order.Id, ct);

        bool eligible = order.WhoPaysForCompanyService == ServicePayer.Sender
                     && !CancelledStatuses.Contains(order.Status);

        if (!eligible)
        {
            if (existing is { DateDeleted: null })
            {
                existing.DateDeleted = DateTime.UtcNow;
                existing.UpdatedAt   = DateTime.UtcNow;
                await context.SaveChangesAsync(ct);
            }
            return;
        }

        var figures = ComputeFigures(new[] { order });

        CustomerSettlement settlement;
        if (existing is null)
        {
            settlement = new CustomerSettlement
            {
                OrderId                               = order.Id,
                CustomerId                            = order.CustomerId.Value,
                CreatedAt                             = order.CreatedAt,
                TotalNumberOfOrdersPlaced             = figures.OrdersPlaced,
                TotalNumberOfOrderDelivered           = figures.OrdersDelivered,
                TotalCODCompanyCollectedForPackages   = figures.CodCollectedForPackages,
                TotalCompanyServicePriceOwedToCompany = figures.CompanyServicePriceOwed,
            };
            context.CustomerSettlements.Add(settlement);
        }
        else
        {
            ApplyFigures(existing, figures);
            settlement = existing;
        }

        // Keep the per-order paid/unpaid flag in lock-step with the recomputed balance.
        ApplyServicePaymentStatus(settlement, new[] { order });

        await context.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Reflects the settlement's service-fee balance down to the per-order flag:
    /// when the customer has fully paid the batch's sender-paid service fees
    /// (outstanding &lt;= 0) every sender-pays order in the batch is marked Paid;
    /// otherwise they are all Unpaid. Partial payments are never attributed to
    /// individual orders — the remaining balance lives on the settlement.
    /// Only <see cref="ServicePayer.Sender"/> orders are touched; Recipient-pays
    /// orders are settled in cash at delivery and keep their own status.
    /// </summary>
    public static void ApplyServicePaymentStatus(CustomerSettlement settlement, IEnumerable<Order> batchOrders)
    {
        bool fullyPaid = settlement.TotalCompanyServicePriceOwedToCompany
                       - settlement.TotalAmountPaidToCompanyForCompanyService <= 0m;
        var status = fullyPaid ? CompanyServicePaymentStatus.Paid : CompanyServicePaymentStatus.Unpaid;

        foreach (var o in batchOrders.Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender))
            o.CompanyServicePaymentStatus = status;
    }

    /// <summary>Refreshes the order-derived figures on an existing row, reviving/soft-deleting by active count. Payments untouched.</summary>
    private static void ApplyFigures(CustomerSettlement existing, Figures figures)
    {
        existing.TotalNumberOfOrdersPlaced             = figures.OrdersPlaced;
        existing.TotalNumberOfOrderDelivered           = figures.OrdersDelivered;
        existing.TotalCODCompanyCollectedForPackages   = figures.CodCollectedForPackages;
        existing.TotalCompanyServicePriceOwedToCompany = figures.CompanyServicePriceOwed;
        existing.UpdatedAt                             = DateTime.UtcNow;
        existing.DateDeleted                           = figures.OrdersPlaced == 0
            ? existing.DateDeleted ?? DateTime.UtcNow
            : null;
    }

    /// <summary>Maps a stored invoice row (with GroupOrder/Order included) to its DTO, deriving outstanding balances.</summary>
    public static CustomerSettlementDto ToDto(CustomerSettlement s, string customerBusinessName)
    {
        bool   isReturn = s.OrderId.HasValue;
        int    packages = s.GroupOrder?.NumberOfPackages ?? 1;
        string status   = (s.GroupOrder?.Status ?? s.Order?.Status)?.ToString() ?? string.Empty;

        return new CustomerSettlementDto(
            Id:                                        s.Id,
            CustomerId:                                s.CustomerId,
            CustomerBusinessName:                      customerBusinessName,
            GroupOrderId:                              s.GroupOrderId,
            OrderId:                                   s.OrderId,
            IsReturn:                                  isReturn,
            NumberOfPackages:                          packages,
            Status:                                    status,
            TotalNumberOfOrdersPlaced:                 s.TotalNumberOfOrdersPlaced,
            TotalNumberOfOrderDelivered:               s.TotalNumberOfOrderDelivered,
            TotalCODCompanyCollectedForPackages:       s.TotalCODCompanyCollectedForPackages,
            TotalAmountOfCollectedCodPaidByCompany:    s.TotalAmountOfCollectedCodPaidByCompany,
            AmountOfCollectedCodPaidByCompany:         s.AmountOfCollectedCodPaidByCompany,
            OutstandingCodOwedToCustomer:              s.TotalCODCompanyCollectedForPackages - s.TotalAmountOfCollectedCodPaidByCompany,
            TotalCompanyServicePriceOwedToCompany:     s.TotalCompanyServicePriceOwedToCompany,
            TotalAmountPaidToCompanyForCompanyService: s.TotalAmountPaidToCompanyForCompanyService,
            AmountPaidToCompanyForCompanyService:      s.AmountPaidToCompanyForCompanyService,
            OutstandingServiceOwedToCompany:           s.TotalCompanyServicePriceOwedToCompany - s.TotalAmountPaidToCompanyForCompanyService,
            CreatedAt:                                 s.CreatedAt.ToString("o"),
            UpdatedAt:                                 s.UpdatedAt?.ToString("o")
        );
    }
}
