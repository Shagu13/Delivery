using Application.Common.Exceptions;
using Application.Settlements.Commands;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// Courier "Settle net" records the ticked COD hand-overs and the ticked salaries in one request. It must
/// be all-or-nothing, and must never pay a salary twice when the hand-over already kept it out of the cash.
/// </summary>
public sealed class SettleCourierNetTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(db)
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options);

    private static async Task<Guid> SeedOrder(string db, Guid courierId, ServicePayer payer, decimal cash, decimal salary)
    {
        using AppDbContext ctx = Ctx(db);
        Order o = new()
        {
            TrackingNumber           = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName            = "Recipient",
            RecipientPhone           = "555111222",
            RecipientCity            = "City",
            RecipientDistrict        = "District",
            RecipientAddress         = "Some street 1",
            OrderType                = OrderType.Send,
            Status                   = OrderStatus.DeliveredToRecipient,
            WhoPaysForCompanyService = payer,
            ProductPaymentStatus     = PaymentStatus.Paid,
            CompanyServicePrice      = 9m,
            AmountToCollectForPackage = payer == ServicePayer.Sender ? cash : cash - 9m,
            AmountOfCashCollected    = cash,
            CourierSalary            = salary,
            CourierId                = courierId,
            DeliveredAt              = CustomTime.Now,
            CreatedAt                = CustomTime.Now,
        };
        ctx.Orders.Add(o);
        await ctx.SaveChangesAsync();
        return o.Id;
    }

    private static CourierOrderPaymentAllocation[] A(Guid id, decimal amount) => new[] { new CourierOrderPaymentAllocation(id, amount) };

    [Fact]
    public async Task SenderPaysOrders_BothFlowsRecorded_AsTwoReceipts()
    {
        string db = $"cnet-ok-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        Guid codOrder = await SeedOrder(db, courier, ServicePayer.Sender, cash: 50m, salary: 4m);
        Guid salOrder = await SeedOrder(db, courier, ServicePayer.Sender, cash: 0m,  salary: 4m);

        using (AppDbContext ctx = Ctx(db))
            await new SettleCourierNetCommandHandler(ctx).Handle(
                new SettleCourierNetCommand(courier, A(salOrder, 4m), A(codOrder, 50m)), CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Assert.Equal(50m, (await verify.Orders.SingleAsync(o => o.Id == codOrder)).CodTransferedToCompanyByCourier);
        Assert.Equal(4m,  (await verify.Orders.SingleAsync(o => o.Id == salOrder)).CourierSalaryPaidAmount);
        Assert.Equal(2, await verify.PaymentReceipts.CountAsync());
    }

    [Fact]
    public async Task RejectedSalaryAmount_LeavesTheHandOverUnrecorded()
    {
        string db = $"cnet-atomic-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        Guid codOrder = await SeedOrder(db, courier, ServicePayer.Sender, cash: 50m, salary: 4m);
        Guid salOrder = await SeedOrder(db, courier, ServicePayer.Sender, cash: 0m,  salary: 4m);

        using (AppDbContext ctx = Ctx(db))
            await Assert.ThrowsAsync<ConflictException>(() => new SettleCourierNetCommandHandler(ctx).Handle(
                new SettleCourierNetCommand(courier, A(salOrder, 40m), A(codOrder, 50m)),   // salary is only 4
                CancellationToken.None));

        using AppDbContext verify = Ctx(db);
        Assert.Null((await verify.Orders.SingleAsync(o => o.Id == codOrder)).CodTransferedToCompanyByCourier);
        Assert.Equal(0, await verify.PaymentReceipts.CountAsync());
    }

    [Fact]
    public async Task RecipientPaysOrderTickedInBothFlows_SalaryIsNotPaidTwice()
    {
        string db = $"cnet-double-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        Guid order = await SeedOrder(db, courier, ServicePayer.Recipient, cash: 100m, salary: 4m);

        // Hand-over is cash − salary kept = 96; the salary row is ticked too (4 outstanding as shown).
        using (AppDbContext ctx = Ctx(db))
            await new SettleCourierNetCommandHandler(ctx).Handle(
                new SettleCourierNetCommand(courier, A(order, 4m), A(order, 96m)), CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Order o = await verify.Orders.SingleAsync(x => x.Id == order);
        Assert.Equal(96m, o.CodTransferedToCompanyByCourier);
        Assert.Equal(4m,  o.CourierSalaryPaidAmount);                    // credited once, by the hand-over
        Assert.Equal(1, await verify.PaymentReceipts.CountAsync());      // only the hand-over receipt
    }

    [Fact]
    public async Task OnlySalaryTicked_BehavesLikeAPlainSalaryPayment()
    {
        string db = $"cnet-salary-only-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        Guid order = await SeedOrder(db, courier, ServicePayer.Sender, cash: 0m, salary: 4m);

        using (AppDbContext ctx = Ctx(db))
            await new SettleCourierNetCommandHandler(ctx).Handle(
                new SettleCourierNetCommand(courier, A(order, 4m), Array.Empty<CourierOrderPaymentAllocation>()),
                CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Assert.Equal(1, await verify.PaymentReceipts.CountAsync());
    }
}
