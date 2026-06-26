using Application.Common.Exceptions;
using Application.Finance;
using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Commands;

/// <summary>Which courier-side money flow a bulk payment applies to.</summary>
public enum CourierPaymentFlow
{
    /// <summary>Courier salary (company → courier): accumulates onto CourierSalaryPaidAmount.</summary>
    Salary,
    /// <summary>COD hand-over (courier → company): accumulates onto CodTransferedToCompanyByCourier.</summary>
    CodTransfer,
}

/// <summary>A payment amount allocated to a single order.</summary>
public sealed record CourierOrderPaymentAllocation(Guid OrderId, decimal Amount);

/// <summary>
/// Records courier-side settlement payments across several of a courier's delivered orders
/// in one atomic operation. <paramref name="Flow"/> selects the direction; each allocation
/// is capped at that order's outstanding for the flow. Mirrors the customer-side
/// PayCustomerOrdersCommand. Per-order fields are the source of truth; aggregates derive live.
/// </summary>
public sealed record PayCourierOrdersCommand(
    Guid                                          CourierId,
    CourierPaymentFlow                            Flow,
    IReadOnlyList<CourierOrderPaymentAllocation>  Allocations
) : IRequest<int>;

public sealed class PayCourierOrdersCommandHandler
    : IRequestHandler<PayCourierOrdersCommand, int>
{
    private const decimal Epsilon = 0.005m;

    private readonly IAppDbContext _context;
    public PayCourierOrdersCommandHandler(IAppDbContext context) => _context = context;

    public async Task<int> Handle(PayCourierOrdersCommand request, CancellationToken ct)
    {
        var ids = request.Allocations.Select(a => a.OrderId).Distinct().ToList();

        var orders = await _context.Orders
            .Where(o => ids.Contains(o.Id) && o.CourierId == request.CourierId)
            .ToListAsync(ct);

        var byId = orders.ToDictionary(o => o.Id);
        var now  = CustomTime.Now;

        foreach (var alloc in request.Allocations)
        {
            if (alloc.Amount <= 0m) continue;

            if (!byId.TryGetValue(alloc.OrderId, out var order))
                throw new NotFoundException("Order", alloc.OrderId);

            if (request.Flow == CourierPaymentFlow.Salary)
                ApplySalary(order, alloc.Amount, now);
            else
                ApplyCodTransfer(order, alloc.Amount, now);
        }

        await _context.SaveChangesAsync(ct);
        return orders.Count;
    }

    private static void ApplySalary(Order order, decimal amount, DateTime now)
    {
        decimal owed        = order.CourierSalary ?? 0m;
        decimal already     = order.CourierSalaryPaidAmount ?? 0m;
        decimal outstanding = owed - already;

        if (amount > outstanding + Epsilon)
            throw new ConflictException($"Salary payment for order {order.TrackingNumber} exceeds its outstanding balance.");

        order.CourierSalaryPaidAmount = already + amount;
        order.CourierSalaryPaidAt     = now;
    }

    private static void ApplyCodTransfer(Order order, decimal amount, DateTime now)
    {
        // Recipient-pays orders: the courier keeps their salary out of the collected cash,
        // so the cash they owe the company is the collected total minus salary.
        bool    keepSalary = order.WhoPaysForCompanyService == ServicePayer.Recipient;
        decimal salary     = keepSalary ? (order.CourierSalary ?? 0m) : 0m;
        decimal owed        = OrderFinance.ExpectedCourierCash(order) - salary;
        decimal already     = order.CodTransferedToCompanyByCourier ?? 0m;
        decimal outstanding = owed - already;

        if (amount > outstanding + Epsilon)
            throw new ConflictException($"COD transfer for order {order.TrackingNumber} exceeds its outstanding balance.");

        order.IsCourierSalaryIncludedSpecialCase = keepSalary;
        order.CodTransferedToCompanyByCourier    = already + amount;
        order.CodTransferedToCompanyByCourierAt   = now;
    }
}
