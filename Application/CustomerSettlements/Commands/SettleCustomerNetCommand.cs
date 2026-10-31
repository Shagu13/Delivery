using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Commands;

/// <summary>
/// The admin "Settle net" action: pays the ticked COD payouts (company → customer) and the ticked
/// service fees (customer → company) together, all-or-nothing. Either list may be empty, not both.
/// Uses the same per-order rules and receipt shape as <see cref="PayCustomerOrdersCommand"/>
/// (COD first, then service — the same order the two separate calls used), but loads the orders
/// once and saves once, so a rejected service amount can no longer leave the COD payout recorded.
/// </summary>
public sealed record SettleCustomerNetCommand(
    Guid                                  CustomerId,
    IReadOnlyList<OrderPaymentAllocation> CodAllocations,
    IReadOnlyList<OrderPaymentAllocation> ServiceAllocations
) : IRequest<int>;

public sealed class SettleCustomerNetCommandHandler
    : IRequestHandler<SettleCustomerNetCommand, int>
{
    private readonly IAppDbContext _context;
    public SettleCustomerNetCommandHandler(IAppDbContext context) => _context = context;

    public async Task<int> Handle(SettleCustomerNetCommand request, CancellationToken ct)
    {
        await PayCustomerOrdersCommandHandler.EnsureNotTenantOwnedAsync(_context, request.CustomerId, ct);

        var ids = request.CodAllocations.Concat(request.ServiceAllocations)
            .Select(a => a.OrderId).Distinct().ToList();

        var orders = await _context.Orders
            .Where(o => ids.Contains(o.Id)
                     && (o.GroupOrder!.CustomerId == request.CustomerId || o.CustomerId == request.CustomerId))
            .ToListAsync(ct);

        var byId = orders.ToDictionary(o => o.Id);
        var now  = CustomTime.Now;

        var codApplied = new List<OrderPaymentAllocation>();
        foreach (OrderPaymentAllocation alloc in request.CodAllocations)
        {
            if (alloc.Amount <= 0m) continue;
            if (!byId.TryGetValue(alloc.OrderId, out Order? order))
                throw new NotFoundException("Order", alloc.OrderId);
            PayCustomerOrdersCommandHandler.ApplyCod(order, alloc.Amount, now);
            codApplied.Add(alloc);
        }

        var svcApplied = new List<OrderPaymentAllocation>();
        foreach (OrderPaymentAllocation alloc in request.ServiceAllocations)
        {
            if (alloc.Amount <= 0m) continue;
            if (!byId.TryGetValue(alloc.OrderId, out Order? order))
                throw new NotFoundException("Order", alloc.OrderId);
            PayCustomerOrdersCommandHandler.ApplyService(order, alloc.Amount, now);
            svcApplied.Add(alloc);
        }

        if (codApplied.Count > 0)
            _context.PaymentReceipts.Add(PayCustomerOrdersCommandHandler.BuildReceipt(request.CustomerId, false, codApplied, now));
        if (svcApplied.Count > 0)
            _context.PaymentReceipts.Add(PayCustomerOrdersCommandHandler.BuildReceipt(request.CustomerId, true, svcApplied, now));

        // One save for both flows: any rejected amount above throws before this line, so nothing is persisted.
        await _context.SaveChangesAsync(ct);
        return orders.Count;
    }
}
