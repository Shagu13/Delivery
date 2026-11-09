using Application.CompanyFinance.DTOs;
using Application.CompanyFinance.Queries;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// The company finance overview and its order drill-down share one set of order definitions
/// (CompanyFinanceOrderSets). A Send order marked "Returned to Sender" matches both the delivered
/// and the billable-failed definitions on its face — it must be counted once, as billable failed.
/// </summary>
public sealed class CompanyFinanceOrdersTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(db).Options);

    private static Order Make(OrderStatus status, decimal fee, decimal? salary, string tn, OrderType type = OrderType.Send) => new()
    {
        TrackingNumber      = tn,
        RecipientName       = "Recipient",
        RecipientPhone      = "555111222",
        RecipientCity       = "Tbilisi",
        RecipientDistrict   = "Vake",
        RecipientAddress    = "Some street 1",
        OrderType           = type,
        Status              = status,
        CompanyServicePrice = fee,
        CourierSalary       = salary,
        CreatedAt           = CustomTime.Now,
    };

    private static async Task Seed(string db)
    {
        using AppDbContext ctx = Ctx(db);
        DateTime now = CustomTime.Now;

        // 1. Plainly delivered: fee 5, salary 3, COD 100.
        Order delivered = Make(OrderStatus.DeliveredToRecipient, 5m, 3m, "TN-DELIVERED");
        delivered.DeliveredAt = now;
        delivered.AmountToCollectForPackage = 100m;

        // 2. Walk-in Send marked "Returned to Sender": ReturnedToSender + DeliveredAt + a warehouse
        //    stamp + a billable reason. Fee 7, salary 4. Must count ONCE (billable failed).
        Order returnedToSender = Make(OrderStatus.ReturnedToSender, 7m, 4m, "TN-RTS");
        returnedToSender.DeliveredAt            = now;
        returnedToSender.DeliveredToWarehouseAt = now;
        returnedToSender.CancellationReason     = CancellationReason.Other;
        returnedToSender.IsWalkIn               = true;

        // 3. Cancel & charge by admin: fee 6, salary 2.
        Order cancelledAndCharged = Make(OrderStatus.CancelledByAdmin, 6m, 2m, "TN-CHARGED");
        cancelledAndCharged.CancellationReason = CancellationReason.Other;
        cancelledAndCharged.CancelledAt        = now;

        // 4./5. Not billable — plain cancel, and a DidNotWant cancel. Neither is counted.
        Order plainCancel = Make(OrderStatus.CancelledByAdmin, 9m, 9m, "TN-PLAIN");
        plainCancel.CancelledAt = now;
        Order didNotWant = Make(OrderStatus.OrderNotAccepted, 9m, 9m, "TN-DIDNOTWANT");
        didNotWant.CancellationReason = CancellationReason.DidNotWant;
        didNotWant.CancelledAt        = now;

        ctx.Orders.AddRange(delivered, returnedToSender, cancelledAndCharged, plainCancel, didNotWant);
        await ctx.SaveChangesAsync();
    }

    private static DateOnly Today => DateOnly.FromDateTime(CustomTime.Today);

    [Fact]
    public async Task ReturnedToSenderSend_IsCountedOnce_AsBillableFailed()
    {
        string db = Guid.NewGuid().ToString();
        await Seed(db);
        using AppDbContext ctx = Ctx(db);

        CompanyFinanceOverviewDto o = await new GetCompanyFinanceOverviewQueryHandler(ctx)
            .Handle(new GetCompanyFinanceOverviewQuery(Today, Today), CancellationToken.None);

        Assert.Equal(1, o.OrdersDelivered);            // only TN-DELIVERED
        Assert.Equal(18m, o.ServiceRevenue);           // 5 + 7 + 6, not 25
        Assert.Equal(9m, o.CourierSalary);             // 3 + 4 + 2, not 13
        Assert.Equal(9m, o.NetOperatingMargin);
        Assert.Equal(100m, o.CodPassThrough);
    }

    [Fact]
    public async Task OrderList_ReconcilesWithTheOverviewTotals()
    {
        string db = Guid.NewGuid().ToString();
        await Seed(db);
        using AppDbContext ctx = Ctx(db);

        CompanyFinanceOverviewDto overview = await new GetCompanyFinanceOverviewQueryHandler(ctx)
            .Handle(new GetCompanyFinanceOverviewQuery(Today, Today), CancellationToken.None);
        CompanyFinanceOrdersDto list = await new GetCompanyFinanceOrdersQueryHandler(ctx)
            .Handle(new GetCompanyFinanceOrdersQuery(Today, Today), CancellationToken.None);

        Assert.Equal(
            new[] { "TN-CHARGED", "TN-DELIVERED", "TN-RTS" },
            list.Orders.Select(x => x.TrackingNumber).OrderBy(x => x).ToArray());
        Assert.Equal(overview.OrdersDelivered, list.Orders.Count(x => x.Group == CompanyFinanceOrderGroup.Delivered));
        Assert.Equal(overview.ServiceRevenue,     list.Orders.Sum(x => x.ServiceFee));
        Assert.Equal(overview.CourierSalary,      list.Orders.Sum(x => x.CourierSalary ?? 0m));
        Assert.Equal(overview.NetOperatingMargin, list.Orders.Sum(x => x.Margin));
        Assert.Equal(overview.CodPassThrough,     list.Orders.Sum(x => x.Cod ?? 0m));
        Assert.Equal(CompanyFinanceOrderGroup.BillableFailed,
            list.Orders.Single(x => x.TrackingNumber == "TN-RTS").Group);
    }

    /// <summary>
    /// The overview loads only <c>CashPositionFields</c> for its cumulative figures. Seed orders with
    /// every money/flag column set, then check the overview against <c>OrderFinance</c> run over the
    /// full entities — a column dropped from the projection would make these drift.
    /// </summary>
    [Fact]
    public async Task CashPosition_MatchesOrderFinanceOverFullEntities()
    {
        string db = Guid.NewGuid().ToString();
        DateTime now = CustomTime.Now;

        Order recipientPays = Make(OrderStatus.DeliveredToRecipient, 7m, 3m, "TN-RP");
        recipientPays.DeliveredAt                        = now;
        recipientPays.WhoPaysForCompanyService           = ServicePayer.Recipient;
        recipientPays.CustomerSurcharge                  = 1m;
        recipientPays.AmountToCollectForPackage          = 50m;
        recipientPays.CodTransferedToCompanyByCourier    = 50m;
        recipientPays.CourierSalaryPaidAmount            = 3m;
        recipientPays.IsCourierSalaryIncludedSpecialCase = true;
        recipientPays.CodPaidToCustomerAmount            = 20m;
        recipientPays.ServicePaidByCustomerAmount        = 1m;

        Order senderNetted = Make(OrderStatus.DeliveredToRecipient, 5m, 2m, "TN-SN");
        senderNetted.DeliveredAt                              = now;
        senderNetted.AmountToCollectForPackage                = 80m;
        senderNetted.CodTransferedToCompanyByCourier          = 60m;
        senderNetted.CodPaidToCustomerAmount                  = 75m;
        senderNetted.CourierSalaryPaidAmount                  = 1m;
        senderNetted.IsCompanyServicePriceIncludedSpecialCase = true;

        Order failed = Make(OrderStatus.CancelledByAdmin, 6m, 2m, "TN-FAIL");
        failed.WhoPaysForCompanyService           = ServicePayer.Recipient;
        failed.CancellationReason                 = CancellationReason.Other;
        failed.CancelledAt                        = now;
        failed.IsCourierSalaryIncludedSpecialCase = true;
        failed.CourierSalaryPaidAmount            = 2m;
        failed.ServicePaidByCustomerAmount        = 4m;

        Order prepaid = Make(OrderStatus.CourierAssignedToDeliver, 9m, null, "TN-PRE");
        prepaid.ServicePaidByCustomerAmount = 9m;
        prepaid.ServicePaidByCustomerAt     = now;

        Order[] all = { recipientPays, senderNetted, failed, prepaid };
        using (AppDbContext seed = Ctx(db))
        {
            seed.Orders.AddRange(all);
            await seed.SaveChangesAsync();
        }

        using AppDbContext ctx = Ctx(db);
        CompanyFinanceOverviewDto o = await new GetCompanyFinanceOverviewQueryHandler(ctx)
            .Handle(new GetCompanyFinanceOverviewQuery(Today, Today), CancellationToken.None);

        Order[] delivered = { recipientPays, senderNetted };
        Assert.Equal(all.Sum(Application.Finance.OrderFinance.CompanyNetCash), o.NetCashPosition);
        Assert.Equal(delivered.Sum(Application.Finance.OrderFinance.OutstandingCourierRemittance),
                     o.OutstandingCourierRemittance);
        Assert.Equal(delivered.Sum(Application.Finance.OrderFinance.SenderServiceShare) + 9m + 6m
                   - all.Sum(x => x.ServicePaidByCustomerAmount ?? 0m),
                     o.OutstandingServiceReceivable);
        Assert.Equal(130m - 95m, o.OutstandingCodOwedToCustomers);
        Assert.Equal((3m + 2m + 2m) - (3m + 1m + 2m), o.OutstandingSalaryOwed);
        Assert.Equal(7m - 1m, o.ServiceCollectedFromRecipient);
    }

    [Fact]
    public async Task CityFilter_NarrowsTheList()
    {
        string db = Guid.NewGuid().ToString();
        await Seed(db);
        using AppDbContext ctx = Ctx(db);

        CompanyFinanceOrdersDto list = await new GetCompanyFinanceOrdersQueryHandler(ctx)
            .Handle(new GetCompanyFinanceOrdersQuery(Today, Today, new[] { "Kutaisi" }), CancellationToken.None);

        Assert.Empty(list.Orders);
    }
}
