using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Commands;

/// <summary>A payment amount allocated to a single order.</summary>
public sealed record OrderPaymentAllocation(Guid OrderId, decimal Amount);

/// <summary>
/// Records settlement payments across several of a customer's orders in one atomic
/// operation. <paramref name="Service"/> selects the money flow:
///   • false → COD payout (company → customer): accumulates onto CodPaidToCustomerAmount.
///   • true  → service fee (customer → company): accumulates onto ServicePaidByCustomerAmount
///             for sender-pays orders and advances CompanyServicePaymentStatus.
/// Each allocation is capped at the order's outstanding for that flow. Used by the admin
/// finance page when paying a customer's delivered orders, in full or partially across a
/// chosen subset. The affected batch/return settlement rollups are refreshed afterwards.
/// </summary>
public sealed record PayCustomerOrdersCommand(
    Guid                                  CustomerId,
    bool                                  Service,
    IReadOnlyList<OrderPaymentAllocation> Allocations
) : IRequest<int>;

public sealed class PayCustomerOrdersCommandHandler
    : IRequestHandler<PayCustomerOrdersCommand, int>
{
    private const decimal Epsilon = 0.005m;

    private readonly IAppDbContext _context;
    public PayCustomerOrdersCommandHandler(IAppDbContext context) => _context = context;

    public async Task<int> Handle(PayCustomerOrdersCommand request, CancellationToken ct)
    {
        var ids = request.Allocations.Select(a => a.OrderId).Distinct().ToList();

        var orders = await _context.Orders
            .Where(o => ids.Contains(o.Id)
                     && (o.GroupOrder!.CustomerId == request.CustomerId || o.CustomerId == request.CustomerId))
            .ToListAsync(ct);

        var byId = orders.ToDictionary(o => o.Id);
        var now  = DateTime.UtcNow;

        foreach (var alloc in request.Allocations)
        {
            if (alloc.Amount <= 0m) continue;

            if (!byId.TryGetValue(alloc.OrderId, out var order))
                throw new NotFoundException("Order", alloc.OrderId);

            if (request.Service)
                ApplyService(order, alloc.Amount, now);
            else
                ApplyCod(order, alloc.Amount, now);
        }

        await _context.SaveChangesAsync(ct);

        // Refresh affected settlement rollups (the upsert dedups groups internally).
        foreach (var order in orders)
            await CustomerSettlementService.UpsertForOrderAsync(_context, order, ct);

        return orders.Count;
    }

    private static void ApplyCod(Domain.Order order, decimal amount, DateTime now)
    {
        decimal owed        = order.AmountToCollectForPackage ?? 0m;
        decimal already     = order.CodPaidToCustomerAmount ?? 0m;
        decimal outstanding = owed - already;

        if (amount > outstanding + Epsilon)
            throw new ConflictException($"COD payment for order {order.TrackingNumber} exceeds its outstanding balance.");

        order.CodPaidToCustomerAmount      = already + amount;
        order.IsCollectedCodPaidToCustomer = true;
        order.CodPaidToCustomerAt          = now;
    }

    private static void ApplyService(Domain.Order order, decimal amount, DateTime now)
    {
        if (order.WhoPaysForCompanyService != ServicePayer.Sender)
            throw new ConflictException(
                $"The service fee for order {order.TrackingNumber} is collected from the recipient, not invoiced to the sender.");

        decimal owed        = order.CompanyServicePrice;
        decimal already     = order.ServicePaidByCustomerAmount ?? 0m;
        decimal outstanding = owed - already;

        if (amount > outstanding + Epsilon)
            throw new ConflictException($"Service payment for order {order.TrackingNumber} exceeds its outstanding balance.");

        decimal newPaid = already + amount;
        order.ServicePaidByCustomerAmount = newPaid;
        order.ServicePaidByCustomerAt     = now;
        order.CompanyServicePaymentStatus = newPaid >= owed - Epsilon
            ? CompanyServicePaymentStatus.Paid
            : CompanyServicePaymentStatus.Pending;
    }
}
