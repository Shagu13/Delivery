using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

public sealed record InvoiceOrderRow(
    string   TrackingNumber,
    string   RecipientFirstName,
    string   RecipientLastName,
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

        Domain.CustomerSettlement settlement = await _context.CustomerSettlements
            .AsNoTracking()
            .Include(s => s.GroupOrder)
                .ThenInclude(g => g!.Orders)
            .Include(s => s.Order)
            .FirstOrDefaultAsync(
                s => s.Id         == request.SettlementId
                  && s.CustomerId == customer.Id
                  && s.DateDeleted == null,
                cancellationToken)
            ?? throw new NotFoundException("Settlement", request.SettlementId);

        List<Domain.Order> allOrders;

        if (settlement.GroupOrder is not null)
            allOrders = settlement.GroupOrder.Orders.ToList();
        else if (settlement.Order is not null)
            allOrders = [settlement.Order];
        else
            allOrders = [];

        List<InvoiceOrderRow> rows = allOrders
            .Where(o => !CancelledStatuses.Contains(o.Status))
            .Select(o => new InvoiceOrderRow(
                TrackingNumber:       o.TrackingNumber,
                RecipientFirstName:   o.RecipientFirstName,
                RecipientLastName:    o.RecipientLastName,
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

        decimal outstandingCod     = settlement.TotalCODCompanyCollectedForPackages
                                   - settlement.TotalAmountOfCollectedCodPaidByCompany;
        decimal outstandingService = settlement.TotalCompanyServicePriceOwedToCompany
                                   - settlement.TotalAmountPaidToCompanyForCompanyService;

        return new SettlementInvoiceData(
            CustomerBusinessName: customer.BusinessName,
            BatchCreatedAt:       settlement.CreatedAt,
            IsReturn:             settlement.OrderId.HasValue,
            Orders:               rows,
            TotalCodCollected:    settlement.TotalCODCompanyCollectedForPackages,
            TotalServiceFee:      settlement.TotalCompanyServicePriceOwedToCompany,
            OutstandingCod:       outstandingCod,
            OutstandingService:   outstandingService
        );
    }
}
