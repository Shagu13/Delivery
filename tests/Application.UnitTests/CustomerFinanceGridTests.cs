using Application.CustomerSettlements.Queries;
using Domain;
using Domain.Enums;
using Persistence;

namespace Application.UnitTests;

/// <summary>Admin Finance → Payments grid: the three modes and the per-customer contact rows.</summary>
public sealed class CustomerFinanceGridTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(CustomTime.Today);

    private static Customer AddCustomer(AppDbContext ctx, string business)
    {
        Customer c = TestSupport.Cust();
        c.BusinessName = business;
        c.ApplicationUserId = $"u-{Guid.NewGuid():N}";
        ctx.Customers.Add(c);
        return c;
    }

    private static Order AddOrder(
        AppDbContext ctx, Guid customerId, DateTime? deliveredAt, decimal cod = 0m, decimal codPaid = 0m,
        ServicePayer payer = ServicePayer.Recipient, decimal fee = 8m, decimal servicePaid = 0m,
        OrderStatus status = OrderStatus.DeliveredToRecipient, CancellationReason? reason = null, DateTime? cancelledAt = null)
    {
        Order o = new()
        {
            TrackingNumber           = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName            = "Recipient",
            RecipientPhone           = "555111222",
            RecipientCity            = "City",
            RecipientDistrict        = "District",
            RecipientAddress         = "Some street 1",
            OrderType                = OrderType.Send,
            Status                   = status,
            CustomerId               = customerId,
            WhoPaysForCompanyService = payer,
            ProductPaymentStatus     = PaymentStatus.Paid,
            CompanyServicePrice      = fee,
            AmountToCollectForPackage = cod == 0m ? null : cod,
            CodPaidToCustomerAmount  = codPaid == 0m ? null : codPaid,
            ServicePaidByCustomerAmount = servicePaid == 0m ? null : servicePaid,
            DeliveredAt              = deliveredAt,
            CancellationReason       = reason,
            CancelledAt              = cancelledAt,
            CreatedAt                = deliveredAt ?? cancelledAt ?? CustomTime.Now,
        };
        ctx.Orders.Add(o);
        return o;
    }

    private static Task<CustomerFinanceGridDto> Run(AppDbContext ctx, CustomerGridMode mode, DateOnly? date) =>
        new GetCustomerFinanceGridQueryHandler(ctx)
            .Handle(new GetCustomerFinanceGridQuery(mode, date), CancellationToken.None);

    [Fact]
    public async Task Delivered_mode_lists_only_customers_delivered_in_the_window()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Customer today = AddCustomer(ctx, "Today Shop");
        Customer old   = AddCustomer(ctx, "Old Shop");
        DateTime now = CustomTime.Now;
        AddOrder(ctx, today.Id, now, cod: 50m);
        AddOrder(ctx, old.Id, now.AddDays(-5), cod: 50m);
        await ctx.SaveChangesAsync();

        CustomerFinanceGridDto grid = await Run(ctx, CustomerGridMode.Delivered, Today);

        Assert.Equal(today.Id, Assert.Single(grid.Lines).CustomerId);
        Assert.Equal(today.Id, Assert.Single(grid.Customers).CustomerId);
    }

    [Fact]
    public async Task Delivered_mode_includes_billable_failed_delivery_dated_by_cancellation()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Customer c = AddCustomer(ctx, "Failed Shop");
        AddOrder(ctx, c.Id, deliveredAt: null, payer: ServicePayer.Sender,
            status: OrderStatus.CancelledByAdmin, reason: CancellationReason.DidNotLike,
            cancelledAt: CustomTime.Now);
        await ctx.SaveChangesAsync();

        CustomerFinanceGridDto grid = await Run(ctx, CustomerGridMode.Delivered, Today);

        Assert.Single(grid.Lines);
    }

    [Fact]
    public async Task ToSettle_mode_ignores_the_date_and_lists_cod_or_fee_outstanding()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Customer codOwed  = AddCustomer(ctx, "Cod Owed");
        Customer feeOwed  = AddCustomer(ctx, "Fee Owed");
        Customer settled  = AddCustomer(ctx, "Settled");
        DateTime longAgo = CustomTime.Now.AddDays(-40);
        AddOrder(ctx, codOwed.Id, longAgo, cod: 100m);                                          // COD unpaid
        AddOrder(ctx, feeOwed.Id, longAgo, payer: ServicePayer.Sender, fee: 8m);                // fee unpaid
        AddOrder(ctx, settled.Id, longAgo, cod: 100m, codPaid: 100m, payer: ServicePayer.Sender, fee: 8m, servicePaid: 8m);
        await ctx.SaveChangesAsync();

        CustomerFinanceGridDto grid = await Run(ctx, CustomerGridMode.ToSettle, Today);

        Assert.Equal(
            new[] { codOwed.Id, feeOwed.Id }.OrderBy(i => i),
            grid.Lines.Select(l => l.CustomerId).OrderBy(i => i));
    }

    [Fact]
    public async Task Contacts_pick_the_default_bank_account_and_count_the_rest()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Customer c = AddCustomer(ctx, "Banked");
        ctx.CustomerBankAccounts.Add(new CustomerBankAccount
        {
            CustomerId = c.Id, BankName = "Other", AccountHolderName = "H", AccountNumber = "GE00OTHER",
            CreatedAt = CustomTime.Now.AddDays(-2),
        });
        ctx.CustomerBankAccounts.Add(new CustomerBankAccount
        {
            CustomerId = c.Id, BankName = "TBC", AccountHolderName = "H", AccountNumber = "GE00TBC", IsDefault = true,
        });
        AddOrder(ctx, c.Id, CustomTime.Now, cod: 10m);
        await ctx.SaveChangesAsync();

        CustomerFinanceGridDto grid = await Run(ctx, CustomerGridMode.Effective, Today);

        CustomerFinanceContactDto contact = Assert.Single(grid.Customers);
        Assert.Equal("TBC", contact.DefaultBankName);
        Assert.Equal("GE00TBC", contact.DefaultAccountNumber);
        Assert.Equal(2, contact.BankAccountCount);
    }
}
