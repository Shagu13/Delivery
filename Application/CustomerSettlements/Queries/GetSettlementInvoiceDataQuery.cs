using Application.Common.Exceptions;
using Application.Common.Interfaces;
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

        Domain.GroupOrder? group = await _context.GroupOrders
            .AsNoTracking()
            .Include(g => g.Orders)
            .FirstOrDefaultAsync(g => g.Id == request.SettlementId && g.CustomerId == customer.Id, cancellationToken);

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
                .FirstOrDefaultAsync(o => o.Id == request.SettlementId && o.CustomerId == customer.Id, cancellationToken)
                ?? throw new NotFoundException("Settlement", request.SettlementId);

            allOrders = [order];
            isReturn  = true;
            createdAt = order.CreatedAt;
        }

        List<Domain.Order> activeOrders = allOrders
            .Where(o => !CancelledStatuses.Contains(o.Status))
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
                ServiceFee:           o.CompanyServicePrice,
                WhoPaysServiceFee:    o.WhoPaysForCompanyService.ToString(),
                DeliveredAt:          (o.DeliveredAt ?? o.DeliveredToWarehouseAt)?.ToString("yyyy-MM-dd")
            ))
            .ToList();

        decimal totalCod     = activeOrders.Sum(o => o.AmountToCollectForPackage ?? 0m);
        decimal codPaid      = activeOrders.Sum(o => o.CodPaidToCustomerAmount ?? 0m);

        var senderPays       = activeOrders.Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender).ToList();
        decimal totalService = senderPays.Sum(o => o.CompanyServicePrice);
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
