using Application.Common.Interfaces;
using Application.Finance;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.TenantSettlements.Queries;

/// <summary>One tenant order on the admin per-order settlement sheet (dilo ↔ tenant).</summary>
public sealed record TenantSettlementOrderDto(
    Guid    OrderId,
    string  TrackingNumber,
    string  BusinessName,
    string  CustomerName,
    string  RecipientName,
    string  RecipientAddress,
    string  RecipientCity,
    decimal Cod,
    decimal CodPaidToTenant,
    decimal CompanyServicePrice,
    string  WhoPaysForCompanyService,   // "Sender" | "Recipient"
    decimal ServicePaidByTenant,
    string  CreatedAt,
    string? DeliveredAt,
    /// <summary>The part of the fee the sender (so the tenant) owes on top of what the recipient pays.</summary>
    decimal CustomerSurcharge = 0m,
    /// <summary>What the tenant owes dilo for this order's fee: the whole fee on sender-pays orders,
    /// only the surcharge on recipient-pays ones (OrderFinance.SenderServiceShareOf).</summary>
    decimal ServiceOwed = 0m);

public sealed record TenantSettlementOrdersResult(
    IReadOnlyList<TenantSettlementOrderDto> Orders,
    decimal TotalCod,
    decimal TotalCodPaid,
    decimal TotalService,
    decimal TotalServicePaid);

/// <summary>
/// Admin: the selected tenant's DELIVERED orders, filtered by delivery date (single day, or the
/// whole month when <paramref name="Monthly"/>), with the per-order dilo↔tenant settlement state.
/// </summary>
public sealed record GetTenantSettlementOrdersQuery(Guid TenantId, DateOnly? Date, bool Monthly)
    : IRequest<TenantSettlementOrdersResult>;

public sealed class GetTenantSettlementOrdersQueryHandler
    : IRequestHandler<GetTenantSettlementOrdersQuery, TenantSettlementOrdersResult>
{
    private static readonly OrderStatus[] Delivered =
    {
        OrderStatus.DeliveredToRecipient,
        OrderStatus.ExchangeCompleted,
        OrderStatus.DeliveredReturnOrderToWarehouse,
        OrderStatus.ReturnedToSender,
    };

    private readonly IAppDbContext _context;
    public GetTenantSettlementOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<TenantSettlementOrdersResult> Handle(
        GetTenantSettlementOrdersQuery request, CancellationToken cancellationToken)
    {
        var tid = request.TenantId;

        var rows = await _context.Orders
            .Where(o => Delivered.Contains(o.Status)
                && ((o.GroupOrder != null && o.GroupOrder.Customer != null && o.GroupOrder.Customer.TenantId == tid)
                    || (o.Customer != null && o.Customer.TenantId == tid)))
            .Include(o => o.GroupOrder)
            .Include(o => o.Customer)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        // Filter by the effective delivery date (DeliveredAt ?? DeliveredToWarehouseAt).
        IEnumerable<Domain.Order> filtered = rows;
        if (request.Date is DateOnly d)
        {
            filtered = rows.Where(o =>
            {
                var dt = o.DeliveredAt ?? o.DeliveredToWarehouseAt;
                if (dt is not DateTime val) return false;
                return request.Monthly
                    ? val.Year == d.Year && val.Month == d.Month
                    : DateOnly.FromDateTime(val) == d;
            });
        }

        var ordered = filtered
            .OrderByDescending(o => o.DeliveredAt ?? o.DeliveredToWarehouseAt)
            .ToList();

        var items = ordered.Select(o => new TenantSettlementOrderDto(
            OrderId:                  o.Id,
            TrackingNumber:           o.TrackingNumber,
            BusinessName:             o.GroupOrder?.SenderBusinessName ?? o.Customer?.BusinessName ?? string.Empty,
            CustomerName:             (o.GroupOrder != null
                                          ? $"{o.GroupOrder.SenderFirstName} {o.GroupOrder.SenderLastName}"
                                          : o.Customer != null ? $"{o.Customer.FirstName} {o.Customer.LastName}" : string.Empty).Trim(),
            RecipientName:            o.RecipientName,
            RecipientAddress:         o.RecipientAddress,
            RecipientCity:            o.RecipientCity,
            Cod:                      o.AmountToCollectForPackage ?? 0m,
            CodPaidToTenant:          o.CodPaidToTenantAmount ?? 0m,
            CompanyServicePrice:      o.CompanyServicePrice,
            WhoPaysForCompanyService: o.WhoPaysForCompanyService.ToString(),
            ServicePaidByTenant:      o.ServicePaidByTenantAmount ?? 0m,
            CreatedAt:                o.CreatedAt.ToString("o"),
            DeliveredAt:              (o.DeliveredAt ?? o.DeliveredToWarehouseAt)?.ToString("o"),
            CustomerSurcharge:        o.CustomerSurcharge,
            ServiceOwed:              OrderFinance.SenderServiceShareOf(o.WhoPaysForCompanyService, o.CompanyServicePrice, o.CustomerSurcharge)))
            .ToList();

        decimal totalCod         = items.Sum(i => i.Cod);
        decimal totalCodPaid     = items.Sum(i => i.CodPaidToTenant);
        // Service the tenant owes dilo: the sender-paid fees plus any customer surcharge on recipient-pays orders.
        decimal totalService     = items.Sum(i => i.ServiceOwed);
        decimal totalServicePaid = items.Sum(i => i.ServicePaidByTenant);

        return new TenantSettlementOrdersResult(items, totalCod, totalCodPaid, totalService, totalServicePaid);
    }
}
