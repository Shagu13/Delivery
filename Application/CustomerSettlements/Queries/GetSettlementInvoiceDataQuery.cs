using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Finance;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

public sealed record InvoiceOrderRow(
    string   TrackingNumber,
    string   RecipientName,
    string   RecipientPhone,
    string   RecipientCity,
    string   RecipientDistrict,
    string   RecipientAddress,
    string   OrderType,
    string   Status,
    string   ProductPaymentStatus,
    decimal? CodAmount,
    decimal  ServiceFee,
    string   WhoPaysServiceFee,
    string?  DeliveredAt
);

public sealed record SettlementInvoiceData(
    string                         CustomerBusinessName,
    DateTime                       BatchCreatedAt,
    bool                           IsReturn,
    IReadOnlyList<InvoiceOrderRow> Orders,
    decimal                        TotalCodCollected,
    decimal                        TotalServiceFee,
    decimal                        OutstandingCod,
    decimal                        OutstandingService
);

/// <summary>
/// <paramref name="SettlementId"/> is the batch's GroupOrderId (Send/Exchange) or the
/// standalone Return order's OrderId — the same id the live invoice rows expose.
/// </summary>
public sealed record GetSettlementInvoiceDataQuery(
    Guid   SettlementId,
    string CustomerUserId
) : IRequest<SettlementInvoiceData>;

public sealed class GetSettlementInvoiceDataQueryHandler
    : IRequestHandler<GetSettlementInvoiceDataQuery, SettlementInvoiceData>
{
    private static readonly OrderStatus[] CancelledStatuses =
    [
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    ];

    private readonly IAppDbContext _context;

    public GetSettlementInvoiceDataQueryHandler(IAppDbContext context) =>
        _context = context;

    /// <summary>A recipient-pays order whose sender still owes a surcharge (not a billable failure, which owes it all).</summary>
    private static bool IsSurchargeOnly(Domain.Order o) =>
        !OrderFinance.SenderOwesService(o) && OrderFinance.SenderServiceShare(o) > 0m;

    public async Task<SettlementInvoiceData> Handle(
        GetSettlementInvoiceDataQuery request,
        CancellationToken             cancellationToken)
    {
        Domain.Customer customer = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CustomerUserId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerUserId);

        // The id is a batch (GroupOrder) or a standalone Return order. Resolve whichever
        // the customer owns and gather its active orders.
        List<Domain.Order> allOrders;
        bool     isReturn;
        DateTime createdAt;

        // Walk-in office batches are not part of the customer's own portal — treat as not found.
        Domain.GroupOrder? group = await _context.GroupOrders
            .AsNoTracking()
            .Include(g => g.Orders)
            .FirstOrDefaultAsync(g => g.Id == request.SettlementId && g.CustomerId == customer.Id && !g.IsWalkIn, cancellationToken);

        if (group is not null)
        {
            allOrders = group.Orders.ToList();
            isReturn  = false;
            createdAt = group.CreatedAt;
        }
        else
        {
            Domain.Order order = await _context.Orders
                .AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == request.SettlementId && o.CustomerId == customer.Id && !o.IsWalkIn, cancellationToken)
                ?? throw new NotFoundException("Settlement", request.SettlementId);

            allOrders = [order];
            isReturn  = true;
            createdAt = order.CreatedAt;
        }

        // Active orders plus billable failed deliveries (the sender still owes their fee).
        List<Domain.Order> activeOrders = allOrders
            .Where(o => !CancelledStatuses.Contains(o.Status) || OrderFinance.IsBillableFailedDelivery(o))
            .ToList();

        List<InvoiceOrderRow> rows = activeOrders
            .Select(o => new InvoiceOrderRow(
                TrackingNumber:       o.TrackingNumber,
                RecipientName:        o.RecipientName,
                RecipientPhone:       o.RecipientPhone,
                RecipientCity:        o.RecipientCity,
                RecipientDistrict:    o.RecipientDistrict,
                RecipientAddress:     o.RecipientAddress,
                OrderType:            o.OrderType.ToString(),
                Status:               o.Status.ToString(),
                ProductPaymentStatus: o.ProductPaymentStatus.ToString(),
                CodAmount:            o.AmountToCollectForPackage,
                // A recipient-pays order with a surcharge shows only the part the sender owes, as
                // "Sender", so the column adds up to the invoice total.
                ServiceFee:           IsSurchargeOnly(o) ? OrderFinance.SenderServiceShare(o) : o.CompanyServicePrice,
                WhoPaysServiceFee:    IsSurchargeOnly(o) ? nameof(ServicePayer.Sender) : o.WhoPaysForCompanyService.ToString(),
                DeliveredAt:          (o.DeliveredAt ?? o.DeliveredToWarehouseAt)?.ToString("yyyy-MM-dd")
            ))
            .ToList();

        // Failed deliveries collected no COD; they only carry a sender service-fee receivable.
        decimal totalCod     = activeOrders.Where(o => !OrderFinance.IsBillableFailedDelivery(o))
                                           .Sum(o => o.AmountToCollectForPackage ?? 0m);
        decimal codPaid      = activeOrders.Sum(o => o.CodPaidToCustomerAmount ?? 0m);

        // Sender's share of the fee: whole fee on sender-pays orders, only the surcharge on recipient-pays ones.
        var senderPays       = activeOrders.Where(o => OrderFinance.SenderOwesService(o) || OrderFinance.SenderServiceShare(o) > 0m).ToList();
        decimal totalService = senderPays.Sum(OrderFinance.SenderServiceShare);
        decimal servicePaid  = senderPays.Sum(o => o.ServicePaidByCustomerAmount ?? 0m);

        return new SettlementInvoiceData(
            CustomerBusinessName: customer.BusinessName,
            BatchCreatedAt:       createdAt,
            IsReturn:             isReturn,
            Orders:               rows,
            TotalCodCollected:    totalCod,
            TotalServiceFee:      totalService,
            OutstandingCod:       totalCod - codPaid,
            OutstandingService:   totalService - servicePaid
        );
    }
}
