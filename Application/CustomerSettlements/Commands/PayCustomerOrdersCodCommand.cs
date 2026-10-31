using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Finance;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

using Domain;
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
        await EnsureNotTenantOwnedAsync(_context, request.CustomerId, ct);

        var ids = request.Allocations.Select(a => a.OrderId).Distinct().ToList();

        var orders = await _context.Orders
            .Where(o => ids.Contains(o.Id)
                     && (o.GroupOrder!.CustomerId == request.CustomerId || o.CustomerId == request.CustomerId))
            .ToListAsync(ct);

        var byId = orders.ToDictionary(o => o.Id);
        var now  = CustomTime.Now;

        var applied = new List<OrderPaymentAllocation>();

        foreach (var alloc in request.Allocations)
        {
            if (alloc.Amount <= 0m) continue;

            if (!byId.TryGetValue(alloc.OrderId, out var order))
                throw new NotFoundException("Order", alloc.OrderId);

            if (request.Service)
                ApplyService(order, alloc.Amount, now);
            else
                ApplyCod(order, alloc.Amount, now);

            applied.Add(alloc);
        }

        // Persist an immutable receipt of this action — "on this date we paid/collected
        // $Y across these orders" — so admin/customer can browse payment history by date.
        // Order-level fields above are overwritten in place on the next payment and carry
        // no history on their own.
        if (applied.Count > 0)
            _context.PaymentReceipts.Add(BuildReceipt(request.CustomerId, request.Service, applied, now));

        await _context.SaveChangesAsync(ct);
        return orders.Count;
    }

    /// <summary>A tenant's sub-customers are settled by the tenant, not the company. Shared with the net-settle handler.</summary>
    internal static async Task EnsureNotTenantOwnedAsync(IAppDbContext context, Guid customerId, CancellationToken ct)
    {
        bool tenantOwned = await context.Customers
            .AnyAsync(c => c.Id == customerId && c.TenantId != null, ct);
        if (tenantOwned)
            throw new ConflictException(
                "This customer belongs to a tenant and is settled by the tenant, not the company.");
    }

    /// <summary>The immutable receipt of one pay action (one flow). Shared with the net-settle handler.</summary>
    internal static PaymentReceipt BuildReceipt(
        Guid customerId, bool service, IReadOnlyList<OrderPaymentAllocation> applied, DateTime now)
    {
        var receipt = new PaymentReceipt
        {
            CustomerId  = customerId,
            IsService   = service,
            Flow        = service ? PaymentReceiptFlow.ServiceFee : PaymentReceiptFlow.CodPayout,
            TotalAmount = applied.Sum(a => a.Amount),
            PaidAt      = now,
        };
        foreach (var a in applied)
            receipt.Allocations.Add(new PaymentReceiptAllocation { OrderId = a.OrderId, Amount = a.Amount });
        return receipt;
    }

    internal static void ApplyCod(Domain.Order order, decimal amount, DateTime now)
    {
        decimal owed        = order.AmountToCollectForPackage ?? 0m;
        decimal already     = order.CodPaidToCustomerAmount ?? 0m;
        decimal outstanding = owed - already;

        if (amount > outstanding + Epsilon)
            throw new ConflictException($"COD payment for order {order.TrackingNumber} exceeds its outstanding balance.");

        decimal newPaid = already + amount;
        order.CodPaidToCustomerAmount      = newPaid;
        order.IsCollectedCodPaidToCustomer = true;
        order.CodPaidToCustomerAt          = now;

        // Case 3 auto-net: once the COD is fully paid on an unpaid, sender-pays order, the
        // company retains the service fee out of the payout and settles it in one step.
        bool case3     = order.ProductPaymentStatus == PaymentStatus.NotPaid
                      && order.WhoPaysForCompanyService == ServicePayer.Sender;
        bool fullyPaid = newPaid >= owed - Epsilon;
        if (case3 && fullyPaid && order.CompanyServicePrice > 0m)
        {
            order.IsCompanyServicePriceIncludedSpecialCase = true;
            order.ServicePaidByCustomerAmount              = order.CompanyServicePrice;
            order.ServicePaidByCustomerAt                  = now;
            order.CompanyServicePaymentStatus              = CompanyServicePaymentStatus.Paid;
        }
    }

    internal static void ApplyService(Domain.Order order, decimal amount, DateTime now)
    {
        // The sender owes their share of the fee (OrderFinance.SenderServiceShare): the whole fee for
        // a sender-pays order or a billable failed delivery (the recipient paid nothing), only the
        // customer surcharge when the recipient pays the rest in cash. An ordinary recipient-pays
        // order owes nothing here — the derive-live model never mutates WhoPaysForCompanyService.
        decimal owed = OrderFinance.SenderServiceShare(order);
        if (order.WhoPaysForCompanyService != ServicePayer.Sender && owed <= 0m)
            throw new ConflictException(
                $"The service fee for order {order.TrackingNumber} is collected from the recipient, not invoiced to the sender.");

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
