using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Settlements;
using Domain;
using Domain.Enums;
using FluentValidation.Results;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands.SetCourierSalaryBulk;

/// <summary>
/// All-or-nothing: if any targeted order's service fee is below the salary (revenue would go negative) the whole
/// request is refused and nothing is saved. Orders load in one query, receipts are trimmed in one batch, one save.
/// Per order the effect equals <see cref="SetCourierSalaryCommandHandler"/>: salary, revenue, and paid-salary
/// capping with receipt trimming.
/// </summary>
public sealed class SetCourierSalaryBulkCommandHandler : IRequestHandler<SetCourierSalaryBulkCommand, int>
{
    private readonly IAppDbContext _context;
    public SetCourierSalaryBulkCommandHandler(IAppDbContext context) => _context = context;

    public async Task<int> Handle(SetCourierSalaryBulkCommand request, CancellationToken cancellationToken)
    {
        List<Guid> ids = request.OrderIds.Distinct().ToList();
        List<Order> orders = await _context.Orders
            .Where(o => ids.Contains(o.Id))
            .ToListAsync(cancellationToken);

        if (orders.Count != ids.Count)
        {
            Guid missing = ids.Except(orders.Select(o => o.Id)).First();
            throw new NotFoundException("Order", missing);
        }

        List<string> overFee = orders
            .Where(o => o.CompanyServicePrice < request.Salary)
            .Select(o => o.TrackingNumber)
            .ToList();
        if (overFee.Count > 0)
            throw new ValidationException(new[]
            {
                new ValidationFailure("Salary",
                    $"Salary exceeds the service fee on {overFee.Count} order(s): {string.Join(", ", overFee.Take(10))}" +
                    (overFee.Count > 10 ? "…" : string.Empty)),
            });

        Dictionary<Guid, IReadOnlyDictionary<PaymentReceiptFlow, decimal>> trims = new();
        foreach (Order order in orders)
        {
            order.CourierSalary = request.Salary;
            order.CompanyRevenue = order.CompanyServicePrice - request.Salary;

            decimal excess = CourierSalaryReceiptReconciler.CapPaidAmount(order, request.Salary);
            if (excess > 0m)
                trims[order.Id] = new Dictionary<PaymentReceiptFlow, decimal> { [PaymentReceiptFlow.CourierSalary] = excess };
        }

        await PaymentReceiptTrimmer.TrimManyAsync(_context, trims, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        return orders.Count;
    }
}
