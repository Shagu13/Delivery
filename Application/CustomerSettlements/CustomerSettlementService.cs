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

    /// <summary>The order-derived figures for a batch (owed + per-order recorded payments).</summary>
    public readonly record struct Figures(
        int OrdersPlaced,
        int OrdersDelivered,
        decimal CodCollectedForPackages,
        decimal CompanyServicePriceOwed,
        decimal CodPaidToCustomer,
        decimal ServicePaidByCustomer);

    /// <summary>
    /// Computes counts + money figures over the batch's <b>active</b> (non-cancelled)
    /// orders. Owed: COD = Σ AmountToCollectForPackage (company owes the customer);
    /// service owed = Σ CompanyServicePrice where the sender pays the fee (customer
    /// owes company). Paid: derived live from the per-order payment fields admins tick
    /// on the finance page — COD payout = Σ CodPaidToCustomerAmount; service paid =
    /// Σ ServicePaidByCustomerAmount on sender-pays orders.
    /// </summary>
    private static Figures ComputeFigures(IReadOnlyCollection<Order> orders)
    {
        var active = orders.Where(o => !CancelledStatuses.Contains(o.Status)).ToList();

        int delivered = active.Count(o => DeliveredStatuses.Contains(o.Status));
        decimal cod = active.Sum(o => o.AmountToCollectForPackage ?? 0m);
        decimal codPaid = active.Sum(o => o.CodPaidToCustomerAmount ?? 0m);

        var senderPays = active.Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender).ToList();
        decimal service = senderPays.Sum(o => o.CompanyServicePrice);
        decimal servicePaid = senderPays.Sum(o => o.ServicePaidByCustomerAmount ?? 0m);

        return new Figures(active.Count, delivered, cod, service, codPaid, servicePaid);
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

        if (existing is null)
        {
            var settlement = new CustomerSettlement
            {
                GroupOrderId                              = groupOrderId,
                CustomerId                                = group.CustomerId.Value,
                CreatedAt                                 = group.CreatedAt,
                TotalNumberOfOrdersPlaced                 = figures.OrdersPlaced,
                TotalNumberOfOrderDelivered               = figures.OrdersDelivered,
                TotalCODCompanyCollectedForPackages       = figures.CodCollectedForPackages,
                TotalCompanyServicePriceOwedToCompany     = figures.CompanyServicePriceOwed,
                TotalAmountOfCollectedCodPaidByCompany    = figures.CodPaidToCustomer,
                TotalAmountPaidToCompanyForCompanyService = figures.ServicePaidByCustomer,
                DateDeleted                               = figures.OrdersPlaced == 0 ? CustomTime.Now : null,
            };
            context.CustomerSettlements.Add(settlement);
        }
        else
        {
            ApplyFigures(existing, figures);
        }

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
                existing.DateDeleted = CustomTime.Now;
                existing.UpdatedAt   = CustomTime.Now;
                await context.SaveChangesAsync(ct);
            }
            return;
        }

        var figures = ComputeFigures(new[] { order });

        if (existing is null)
        {
            var settlement = new CustomerSettlement
            {
                OrderId                                   = order.Id,
                CustomerId                                = order.CustomerId.Value,
                CreatedAt                                 = order.CreatedAt,
                TotalNumberOfOrdersPlaced                 = figures.OrdersPlaced,
                TotalNumberOfOrderDelivered               = figures.OrdersDelivered,
                TotalCODCompanyCollectedForPackages       = figures.CodCollectedForPackages,
                TotalCompanyServicePriceOwedToCompany     = figures.CompanyServicePriceOwed,
                TotalAmountOfCollectedCodPaidByCompany    = figures.CodPaidToCustomer,
                TotalAmountPaidToCompanyForCompanyService = figures.ServicePaidByCustomer,
            };
            context.CustomerSettlements.Add(settlement);
        }
        else
        {
            ApplyFigures(existing, figures);
        }

        await context.SaveChangesAsync(ct);
    }

    /// <summary>Refreshes the order-derived figures on an existing row, reviving/soft-deleting by active count. Payments derived from per-order amounts.</summary>
    private static void ApplyFigures(CustomerSettlement existing, Figures figures)
    {
        existing.TotalNumberOfOrdersPlaced                 = figures.OrdersPlaced;
        existing.TotalNumberOfOrderDelivered               = figures.OrdersDelivered;
        existing.TotalCODCompanyCollectedForPackages       = figures.CodCollectedForPackages;
        existing.TotalCompanyServicePriceOwedToCompany     = figures.CompanyServicePriceOwed;
        existing.TotalAmountOfCollectedCodPaidByCompany    = figures.CodPaidToCustomer;
        existing.TotalAmountPaidToCompanyForCompanyService = figures.ServicePaidByCustomer;
        existing.UpdatedAt                                 = CustomTime.Now;
        existing.DateDeleted                               = figures.OrdersPlaced == 0
            ? existing.DateDeleted ?? CustomTime.Now
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
