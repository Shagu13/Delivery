using Application.Common.Exceptions;
using Application.CustomerSettlements.Commands;
using Application.Finance;
using Application.Orders.Commands;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// A customer surcharge is the part of the service fee the SENDER owes on top of what the recipient
/// pays (fee 7: recipient pays 6, customer owes 1). It must not change what the courier collects
/// beyond the recipient's portion, must be a sender receivable that nets against the COD payout,
/// and must leave every order WITHOUT a surcharge behaving exactly as before.
/// </summary>
public sealed class CustomerSurchargeTests
{
    private static Order Delivered(ServicePayer payer, decimal fee, decimal surcharge, decimal? cod, decimal? salary = null) => new()
    {
        TrackingNumber            = "TN-SURCHARGE",
        RecipientName             = "Recipient",
        RecipientPhone            = "555111222",
        RecipientCity             = "City",
        RecipientDistrict         = "District",
        RecipientAddress          = "Some street 1",
        OrderType                 = OrderType.Send,
        Status                    = OrderStatus.DeliveredToRecipient,
        WhoPaysForCompanyService  = payer,
        CompanyServicePrice       = fee,
        CustomerSurcharge         = surcharge,
        AmountToCollectForPackage = cod,
        CourierSalary             = salary,
        DeliveredAt               = CustomTime.Now,
        CreatedAt                 = CustomTime.Now,
    };

    // ── OrderFinance ─────────────────────────────────────────────────────────

    [Fact]
    public void RecipientPays_WithSurcharge_CourierCollectsOnlyTheRecipientPortion()
    {
        Order o = Delivered(ServicePayer.Recipient, fee: 7m, surcharge: 1m, cod: 94m);

        Assert.Equal(6m, OrderFinance.RecipientFeePortion(o));
        Assert.Equal(100m, OrderFinance.ExpectedCourierCash(o));        // 94 COD + 6, not 101
        Assert.Equal(100m, OrderFinance.DeliveredCashCollected(o));
    }

    [Fact]
    public void RecipientPays_WithSurcharge_SenderOwesOnlyTheSurcharge()
    {
        Order o = Delivered(ServicePayer.Recipient, fee: 7m, surcharge: 1m, cod: 94m);

        Assert.Equal(1m, OrderFinance.SenderServiceShare(o));
        Assert.Equal(1m, OrderFinance.ServiceOwedBySender(o));
        Assert.False(OrderFinance.IsCompanyServicePaid(o));
        Assert.Equal(CompanyServicePaymentStatus.Unpaid, OrderFinance.ServicePaymentStatus(o));
        Assert.Equal(94m, OrderFinance.CodOwedToCustomer(o));           // the COD payout itself is unchanged
    }

    [Fact]
    public void PayingTheSurcharge_SettlesIt()
    {
        Order o = Delivered(ServicePayer.Recipient, fee: 7m, surcharge: 1m, cod: 94m);
        o.ServicePaidByCustomerAmount = 1m;

        Assert.Equal(0m, OrderFinance.ServiceOwedBySender(o));
        Assert.True(OrderFinance.IsCompanyServicePaid(o));
        Assert.Equal(CompanyServicePaymentStatus.Paid, OrderFinance.ServicePaymentStatus(o));
    }

    [Fact]
    public void FullySettled_CompanyNetCashConvergesToRevenue()
    {
        // Fee 7 (recipient 6 + sender 1), salary 4 kept out of the courier's cash, COD 94.
        Order o = Delivered(ServicePayer.Recipient, fee: 7m, surcharge: 1m, cod: 94m, salary: 4m);
        o.IsCourierSalaryIncludedSpecialCase = true;
        o.CodTransferedToCompanyByCourier    = 96m;     // 100 collected − 4 salary kept
        o.CodPaidToCustomerAmount            = 94m;
        o.ServicePaidByCustomerAmount        = 1m;

        Assert.Equal(3m, OrderFinance.CompanyRevenue(o));               // 7 − 4
        Assert.Equal(OrderFinance.CompanyRevenue(o), OrderFinance.CompanyNetCash(o));
    }

    [Fact]
    public void RecipientPays_NoSurcharge_BehavesExactlyAsBefore()
    {
        Order o = Delivered(ServicePayer.Recipient, fee: 7m, surcharge: 0m, cod: 94m);

        Assert.Equal(101m, OrderFinance.ExpectedCourierCash(o));
        Assert.Equal(0m, OrderFinance.SenderServiceShare(o));
        Assert.Equal(0m, OrderFinance.ServiceOwedBySender(o));
        Assert.True(OrderFinance.IsCompanyServicePaid(o));
        Assert.Equal(CompanyServicePaymentStatus.Paid, OrderFinance.ServicePaymentStatus(o));
    }

    [Fact]
    public void SenderPays_OwesTheWholeFee()
    {
        Order o = Delivered(ServicePayer.Sender, fee: 7m, surcharge: 0m, cod: 94m);

        Assert.Equal(7m, OrderFinance.SenderServiceShare(o));
        Assert.Equal(94m, OrderFinance.ExpectedCourierCash(o));
    }

    [Fact]
    public void BillableFailedDelivery_SenderOwesTheWholeFee_CourierCollectsNothing()
    {
        Order o = Delivered(ServicePayer.Recipient, fee: 7m, surcharge: 1m, cod: 94m);
        o.CancellationReason = CancellationReason.DidNotLike;   // billable (only DidNotWant / WarehouseNotReceived are not)

        Assert.Equal(7m, OrderFinance.SenderServiceShare(o));
        Assert.Equal(0m, OrderFinance.ExpectedCourierCash(o));
    }

    // ── Persistence-backed flows ─────────────────────────────────────────────

    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(db).Options);

    private static async Task<(Guid OrderId, Guid CustomerId)> Seed(string db, ServicePayer payer, decimal surcharge)
    {
        using AppDbContext ctx = Ctx(db);
        Guid customerId = Guid.NewGuid();
        Order o = Delivered(payer, fee: 7m, surcharge: surcharge, cod: 94m);
        o.CustomerId = customerId;                       // standalone-style ownership (no GroupOrder needed)
        ctx.Orders.Add(o);
        await ctx.SaveChangesAsync();
        return (o.Id, customerId);
    }

    [Fact]
    public async Task ServicePayment_OnRecipientPaysOrderWithSurcharge_IsCappedAtTheSurcharge()
    {
        string db = $"surcharge-pay-{Guid.NewGuid()}";
        (Guid orderId, Guid customerId) = await Seed(db, ServicePayer.Recipient, surcharge: 1m);

        using (AppDbContext ctx = Ctx(db))
            await new PayCustomerOrdersCommandHandler(ctx).Handle(
                new PayCustomerOrdersCommand(customerId, Service: true, new[] { new OrderPaymentAllocation(orderId, 1m) }),
                CancellationToken.None);

        using (AppDbContext verify = Ctx(db))
        {
            Order o = await verify.Orders.SingleAsync(x => x.Id == orderId);
            Assert.Equal(1m, o.ServicePaidByCustomerAmount);
            Assert.Equal(CompanyServicePaymentStatus.Paid, o.CompanyServicePaymentStatus);
        }

        // Paying more than the surcharge (e.g. the whole fee) is rejected.
        using AppDbContext ctx2 = Ctx(db);
        await Assert.ThrowsAsync<ConflictException>(() => new PayCustomerOrdersCommandHandler(ctx2).Handle(
            new PayCustomerOrdersCommand(customerId, Service: true, new[] { new OrderPaymentAllocation(orderId, 5m) }),
            CancellationToken.None));
    }

    [Fact]
    public async Task ServicePayment_OnOrdinaryRecipientPaysOrder_StillRejected()
    {
        string db = $"surcharge-none-{Guid.NewGuid()}";
        (Guid orderId, Guid customerId) = await Seed(db, ServicePayer.Recipient, surcharge: 0m);

        using AppDbContext ctx = Ctx(db);
        await Assert.ThrowsAsync<ConflictException>(() => new PayCustomerOrdersCommandHandler(ctx).Handle(
            new PayCustomerOrdersCommand(customerId, Service: true, new[] { new OrderPaymentAllocation(orderId, 1m) }),
            CancellationToken.None));
    }

    [Fact]
    public async Task SetOrderPrices_WithSurcharge_RecordsRecipientPortionAsCash_AndLeavesSurchargeUnpaid()
    {
        string db = $"surcharge-set-{Guid.NewGuid()}";
        (Guid orderId, _) = await Seed(db, ServicePayer.Recipient, surcharge: 0m);

        using (AppDbContext ctx = Ctx(db))
            await new SetOrderPricesCommandHandler(ctx).Handle(
                new SetOrderPricesCommand(orderId, 7m, 94m, CustomerSurcharge: 1m), CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Order o = await verify.Orders.SingleAsync(x => x.Id == orderId);
        Assert.Equal(1m, o.CustomerSurcharge);
        Assert.Equal(100m, o.AmountOfCashCollected);     // 94 + (7 − 1)
        Assert.Equal(CompanyServicePaymentStatus.Unpaid, o.CompanyServicePaymentStatus);
    }

    [Fact]
    public async Task SetOrderPrices_SurchargeOnSenderPaysOrder_IsRejected()
    {
        string db = $"surcharge-sender-{Guid.NewGuid()}";
        (Guid orderId, _) = await Seed(db, ServicePayer.Sender, surcharge: 0m);

        using AppDbContext ctx = Ctx(db);
        await Assert.ThrowsAsync<ConflictException>(() => new SetOrderPricesCommandHandler(ctx).Handle(
            new SetOrderPricesCommand(orderId, 7m, 94m, CustomerSurcharge: 1m), CancellationToken.None));
    }
}
