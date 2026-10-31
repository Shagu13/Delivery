using Application.Common.Exceptions;
using Application.CustomerSettlements.Commands;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// "Settle net" pays the ticked COD payouts and the ticked service fees in one request. It must be
/// all-or-nothing: a rejected service amount may not leave the COD payout recorded.
/// </summary>
public sealed class SettleCustomerNetTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(db).Options);

    private static Order NewOrder(Guid customerId, ServicePayer payer, decimal cod, decimal fee) => new()
    {
        TrackingNumber            = $"TN-{Guid.NewGuid():N}"[..12],
        RecipientName             = "Recipient",
        RecipientPhone            = "555111222",
        RecipientCity             = "City",
        RecipientDistrict         = "District",
        RecipientAddress          = "Some street 1",
        OrderType                 = OrderType.Send,
        Status                    = OrderStatus.DeliveredToRecipient,
        WhoPaysForCompanyService  = payer,
        ProductPaymentStatus      = PaymentStatus.Paid,
        AmountToCollectForPackage = cod,
        CompanyServicePrice       = fee,
        CustomerId                = customerId,
        DeliveredAt               = CustomTime.Now,
        CreatedAt                 = CustomTime.Now,
    };

    private static async Task<(Guid CodOrder, Guid SvcOrder, Guid Customer)> Seed(string db)
    {
        using AppDbContext ctx = Ctx(db);
        Guid customer = Guid.NewGuid();
        Order codOrder = NewOrder(customer, ServicePayer.Recipient, cod: 94m, fee: 9m);   // company owes 94 COD
        Order svcOrder = NewOrder(customer, ServicePayer.Sender,    cod: 0m,  fee: 9m);   // sender owes 9 fee
        ctx.Orders.AddRange(codOrder, svcOrder);
        await ctx.SaveChangesAsync();
        return (codOrder.Id, svcOrder.Id, customer);
    }

    [Fact]
    public async Task BothFlows_AreRecordedTogether_AsTwoReceipts()
    {
        string db = $"net-ok-{Guid.NewGuid()}";
        (Guid codId, Guid svcId, Guid customer) = await Seed(db);

        using (AppDbContext ctx = Ctx(db))
            await new SettleCustomerNetCommandHandler(ctx).Handle(
                new SettleCustomerNetCommand(customer,
                    new[] { new OrderPaymentAllocation(codId, 94m) },
                    new[] { new OrderPaymentAllocation(svcId, 9m) }),
                CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Assert.Equal(94m, (await verify.Orders.SingleAsync(o => o.Id == codId)).CodPaidToCustomerAmount);
        Assert.Equal(9m,  (await verify.Orders.SingleAsync(o => o.Id == svcId)).ServicePaidByCustomerAmount);
        Assert.Equal(2, await verify.PaymentReceipts.CountAsync());
    }

    [Fact]
    public async Task RejectedServiceAmount_LeavesTheCodPayoutUnrecorded()
    {
        string db = $"net-atomic-{Guid.NewGuid()}";
        (Guid codId, Guid svcId, Guid customer) = await Seed(db);

        using (AppDbContext ctx = Ctx(db))
            await Assert.ThrowsAsync<ConflictException>(() => new SettleCustomerNetCommandHandler(ctx).Handle(
                new SettleCustomerNetCommand(customer,
                    new[] { new OrderPaymentAllocation(codId, 94m) },
                    new[] { new OrderPaymentAllocation(svcId, 50m) }),   // fee is only 9
                CancellationToken.None));

        using AppDbContext verify = Ctx(db);
        Assert.Null((await verify.Orders.SingleAsync(o => o.Id == codId)).CodPaidToCustomerAmount);
        Assert.Equal(0, await verify.PaymentReceipts.CountAsync());
    }

    [Fact]
    public async Task OnlyCodTicked_BehavesLikeAPlainCodPayment()
    {
        string db = $"net-cod-only-{Guid.NewGuid()}";
        (Guid codId, _, Guid customer) = await Seed(db);

        using (AppDbContext ctx = Ctx(db))
            await new SettleCustomerNetCommandHandler(ctx).Handle(
                new SettleCustomerNetCommand(customer,
                    new[] { new OrderPaymentAllocation(codId, 94m) },
                    Array.Empty<OrderPaymentAllocation>()),
                CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Assert.Equal(1, await verify.PaymentReceipts.CountAsync());
    }
}
