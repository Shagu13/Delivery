using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using Application.Finance;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>Which customers the admin Finance → Payments grid lists.</summary>
public enum CustomerGridMode
{
    /// <summary>Today's behavior: every order in the effective-date window (delivered, else placed).</summary>
    Effective,
    /// <summary>Orders delivered in the window, plus billable failed deliveries (dated by CancelledAt).</summary>
    Delivered,
    /// <summary>Anything unsettled either way — COD owed to the customer or fee owed by them — on any date.</summary>
    ToSettle,
}

public sealed record CustomerFinanceContactDto(
    Guid    CustomerId,
    string  FirstName,
    string  LastName,
    string  BusinessName,
    string  PhoneNumber,
    string? DefaultBankName,
    string? DefaultAccountNumber,
    string? DefaultAccountHolder,
    int     BankAccountCount);

/// <summary>The order lines (grouped client-side by customer) plus one contact row per customer in them.</summary>
public sealed record CustomerFinanceGridDto(
    IReadOnlyList<OrderFinanceLineDto>       Lines,
    IReadOnlyList<CustomerFinanceContactDto> Customers);

/// <summary>
/// From/To take precedence over Date/Monthly. <see cref="CustomerGridMode.ToSettle"/> ignores the
/// window entirely — it lists everything outstanding.
/// </summary>
public sealed record GetCustomerFinanceGridQuery(
    CustomerGridMode Mode,
    DateOnly?        Date,
    bool             Monthly = false,
    DateOnly?        From    = null,
    DateOnly?        To      = null
) : IRequest<CustomerFinanceGridDto>;

public sealed class GetCustomerFinanceGridQueryHandler
    : IRequestHandler<GetCustomerFinanceGridQuery, CustomerFinanceGridDto>
{
    private const decimal Epsilon = 0.005m;

    private readonly IAppDbContext _context;
    public GetCustomerFinanceGridQueryHandler(IAppDbContext context) => _context = context;

    public async Task<CustomerFinanceGridDto> Handle(GetCustomerFinanceGridQuery request, CancellationToken ct)
    {
        List<Order> orders = request.Mode switch
        {
            CustomerGridMode.Delivered => await OrderFinanceQueries
                .FilterByDeliveredWindow(OrderFinanceQueries.Base(_context), request.Date, request.Monthly, request.From, request.To)
                .ToListAsync(ct),

            CustomerGridMode.ToSettle => await LoadToSettleAsync(ct),

            _ => await OrderFinanceQueries
                .AllCustomersByEffectiveDate(_context, request.Date, request.Monthly, request.From, request.To)
                .ToListAsync(ct),
        };

        List<OrderFinanceLineDto> lines = orders
            .OrderByDescending(o => o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CancelledAt ?? o.CreatedAt)
            .Select(OrderFinanceQueries.ToDto)
            .ToList();

        List<Guid> customerIds = lines.Select(l => l.CustomerId).Where(id => id != Guid.Empty).Distinct().ToList();
        IReadOnlyList<CustomerFinanceContactDto> contacts = await LoadContactsAsync(customerIds, ct);
        return new CustomerFinanceGridDto(lines, contacts);
    }

    private async Task<List<Order>> LoadToSettleAsync(CancellationToken ct)
    {
        // SQL narrows coarsely on the raw columns (cheap, over-inclusive); OrderFinance then decides
        // exactly, so the rule lives in one place.
        List<Order> candidates = await OrderFinanceQueries
            .FilterByDeliveredWindow(OrderFinanceQueries.Base(_context), null, false, null, null)
            .Where(o => (o.AmountToCollectForPackage ?? 0m) - (o.CodPaidToCustomerAmount ?? 0m) > Epsilon
                     || (o.ServicePaidByCustomerAmount ?? 0m) < o.CompanyServicePrice - Epsilon)
            .ToListAsync(ct);

        return candidates
            .Where(o => OrderFinance.CodOwedToCustomer(o) > Epsilon || OrderFinance.ServiceOwedBySender(o) > Epsilon)
            .ToList();
    }

    private async Task<IReadOnlyList<CustomerFinanceContactDto>> LoadContactsAsync(
        List<Guid> customerIds, CancellationToken ct)
    {
        if (customerIds.Count == 0) return Array.Empty<CustomerFinanceContactDto>();

        List<Customer> customers = await _context.Customers
            .AsNoTracking()
            .Where(c => customerIds.Contains(c.Id))
            .ToListAsync(ct);

        List<CustomerBankAccount> accounts = await _context.CustomerBankAccounts
            .AsNoTracking()
            .Where(a => customerIds.Contains(a.CustomerId))
            .ToListAsync(ct);

        ILookup<Guid, CustomerBankAccount> byCustomer = accounts.ToLookup(a => a.CustomerId);

        return customers
            .Select(c =>
            {
                List<CustomerBankAccount> own = byCustomer[c.Id]
                    .OrderByDescending(a => a.IsDefault)
                    .ThenBy(a => a.CreatedAt)
                    .ToList();
                CustomerBankAccount? primary = own.FirstOrDefault();
                return new CustomerFinanceContactDto(
                    c.Id, c.FirstName, c.LastName, c.BusinessName, c.PhoneNumber,
                    primary?.BankName, primary?.AccountNumber, primary?.AccountHolderName, own.Count);
            })
            .ToList();
    }
}
