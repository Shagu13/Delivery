using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Admin: every customer that still has an outstanding balance in either direction —
/// COD the company owes them, or sender-paid service fees they owe the company —
/// aggregated live across all their active (non-cancelled) orders. Customers fully settled
/// in both directions are omitted, as are tenant sub-customers (settled by their tenant).
/// </summary>
public sealed record GetCustomersWithOutstandingBalancesQuery
    : IRequest<IReadOnlyList<CustomerOutstandingDto>>;

public sealed class GetCustomersWithOutstandingBalancesQueryHandler
    : IRequestHandler<GetCustomersWithOutstandingBalancesQuery, IReadOnlyList<CustomerOutstandingDto>>
{
    private static readonly OrderStatus[] CancelledStatuses =
    {
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    private readonly IAppDbContext _context;
    public GetCustomersWithOutstandingBalancesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CustomerOutstandingDto>> Handle(
        GetCustomersWithOutstandingBalancesQuery request,
        CancellationToken cancellationToken)
    {
        // A billable failed delivery (mirrors OrderFinance.IsBillableFailedDelivery; inlined
        // here because this filter runs in SQL): a Send/Exchange whose handler recorded an
        // explicit (non-warehouse) CancellationReason when cancelling-and-charging or returning
        // to sender. The sender still owes its service fee, so it must be included even though
        // OrderNotAccepted / CancelledByAdmin are otherwise "cancelled".
        var raw = await _context.Orders
            .AsNoTracking()
            .Where(o => !CancelledStatuses.Contains(o.Status)
                     || (o.OrderType != OrderType.Return
                         && o.CancellationReason != null
                         && o.CancellationReason != CancellationReason.WarehouseNotReceived
                         && o.CancellationReason != CancellationReason.DidNotWant))
            .Select(o => new
            {
                CustomerId = o.GroupOrder != null ? o.GroupOrder.CustomerId : o.CustomerId,
                TenantId   = o.GroupOrder != null && o.GroupOrder.Customer != null
                                ? o.GroupOrder.Customer.TenantId
                                : (o.Customer != null ? o.Customer.TenantId : null),
                // Billable failed delivery → recipient paid nothing: no COD collected, fee shifts to sender.
                Billable    = o.OrderType != OrderType.Return
                                && o.CancellationReason != null
                                && o.CancellationReason != CancellationReason.WarehouseNotReceived
                                && o.CancellationReason != CancellationReason.DidNotWant,
                Cod         = o.AmountToCollectForPackage ?? 0m,
                CodPaid     = o.CodPaidToCustomerAmount ?? 0m,
                SenderPays  = o.WhoPaysForCompanyService == ServicePayer.Sender,
                Service     = o.CompanyServicePrice,
                ServicePaid = o.ServicePaidByCustomerAmount ?? 0m,
            })
            .ToListAsync(cancellationToken);

        var owing = raw
            .Where(r => r.CustomerId != null && r.TenantId == null)
            .GroupBy(r => r.CustomerId!.Value)
            .Select(g => new
            {
                CustomerId         = g.Key,
                OutstandingCod     = g.Sum(r => r.Billable ? 0m : r.Cod - r.CodPaid),
                OutstandingService = g.Sum(r => (r.SenderPays || r.Billable) ? r.Service - r.ServicePaid : 0m),
            })
            .Where(a => a.OutstandingCod > 0.005m || a.OutstandingService > 0.005m)
            .ToList();

        if (owing.Count == 0)
            return new List<CustomerOutstandingDto>();

        var ids = owing.Select(a => a.CustomerId).ToList();
        var customers = await _context.Customers
            .AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        return owing
            .Where(a => customers.ContainsKey(a.CustomerId))
            .Select(a =>
            {
                var c = customers[a.CustomerId];
                return new CustomerOutstandingDto(
                    CustomerId:                      a.CustomerId,
                    BusinessName:                    c.BusinessName,
                    FirstName:                       c.FirstName,
                    LastName:                        c.LastName,
                    PhoneNumber:                     c.PhoneNumber,
                    OutstandingCodOwedToCustomer:    Math.Max(0m, a.OutstandingCod),
                    OutstandingServiceOwedToCompany: Math.Max(0m, a.OutstandingService));
            })
            .OrderByDescending(d => d.OutstandingCodOwedToCustomer + d.OutstandingServiceOwedToCompany)
            .ToList();
    }
}
