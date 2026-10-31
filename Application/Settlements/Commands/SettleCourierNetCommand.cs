using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Finance;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Commands;

/// <summary>
/// The admin courier-settlement "Settle net" action: records the ticked COD hand-overs
/// (courier → company) and pays the ticked salaries (company → courier) together, all-or-nothing.
/// Either list may be empty, not both. Same per-order rules and receipt shape as
/// <see cref="PayCourierOrdersCommand"/>, but one load and one save, so a rejected amount in one flow
/// can no longer leave the other flow recorded.
/// <para>Order: hand-overs first. On a recipient-pays order the hand-over credits the salary the
/// courier keeps out of the cash, so a salary allocation on that same order is reduced to whatever
/// salary is still outstanding afterwards (nothing, when the kept salary already covers it) — the courier
/// is never paid the same salary twice.</para>
/// </summary>
public sealed record SettleCourierNetCommand(
    Guid                                         CourierId,
    IReadOnlyList<CourierOrderPaymentAllocation> SalaryAllocations,
    IReadOnlyList<CourierOrderPaymentAllocation> CodTransferAllocations
) : IRequest<int>;

public sealed class SettleCourierNetCommandHandler
    : IRequestHandler<SettleCourierNetCommand, int>
{
    private const decimal Epsilon = 0.005m;

    private readonly IAppDbContext _context;
    public SettleCourierNetCommandHandler(IAppDbContext context) => _context = context;

    public async Task<int> Handle(SettleCourierNetCommand request, CancellationToken ct)
    {
        var ids = request.SalaryAllocations.Concat(request.CodTransferAllocations)
            .Select(a => a.OrderId).Distinct().ToList();

        var orders = await _context.Orders
            .Where(o => ids.Contains(o.Id) && o.CourierId == request.CourierId)
            .ToListAsync(ct);

        var byId = orders.ToDictionary(o => o.Id);
        var now  = CustomTime.Now;

        // Salary outstanding as the admin saw it, before any hand-over credits a kept salary.
        // Each salary allocation is validated against this, exactly as the stand-alone Pay salary does.
        var salaryBefore = orders.ToDictionary(o => o.Id, OrderFinance.CourierSalaryOutstanding);

        var codApplied = new List<CourierOrderPaymentAllocation>();
        foreach (CourierOrderPaymentAllocation alloc in request.CodTransferAllocations)
        {
            if (alloc.Amount <= 0m) continue;
            if (!byId.TryGetValue(alloc.OrderId, out Order? order))
                throw new NotFoundException("Order", alloc.OrderId);
            PayCourierOrdersCommandHandler.ApplyCodTransfer(order, alloc.Amount, now);
            codApplied.Add(alloc);
        }

        var salaryApplied = new List<CourierOrderPaymentAllocation>();
        foreach (CourierOrderPaymentAllocation alloc in request.SalaryAllocations)
        {
            if (alloc.Amount <= 0m) continue;
            if (!byId.TryGetValue(alloc.OrderId, out Order? order))
                throw new NotFoundException("Order", alloc.OrderId);

            if (alloc.Amount > salaryBefore[order.Id] + Epsilon)
                throw new ConflictException($"Salary payment for order {order.TrackingNumber} exceeds its outstanding balance.");

            // A hand-over on this same order may already have credited the salary the courier kept.
            decimal amount = Math.Min(alloc.Amount, OrderFinance.CourierSalaryOutstanding(order));
            if (amount <= Epsilon) continue;

            PayCourierOrdersCommandHandler.ApplySalary(order, amount, now);
            salaryApplied.Add(alloc with { Amount = amount });
        }

        if (codApplied.Count > 0)
            _context.PaymentReceipts.Add(PayCourierOrdersCommandHandler.BuildReceipt(
                request.CourierId, CourierPaymentFlow.CodTransfer, codApplied, now));
        if (salaryApplied.Count > 0)
            _context.PaymentReceipts.Add(PayCourierOrdersCommandHandler.BuildReceipt(
                request.CourierId, CourierPaymentFlow.Salary, salaryApplied, now));

        // One save for both flows: any rejected amount above throws before this line, so nothing is persisted.
        await _context.SaveChangesAsync(ct);
        return orders.Count;
    }
}
