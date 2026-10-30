using Application.Common.Exceptions;
using Application.Settlements.Commands;
using Application.Settlements.Queries;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// Courier-side payment receipts: every <see cref="PayCourierOrdersCommand"/> click records one
/// immutable <see cref="PaymentReceipt"/> (flow = CourierSalary / CourierCodTransfer) so
/// "on this date we paid courier X this much across these orders" survives the per-order
/// fields being overwritten by the next payment. Mirrors the customer-side receipt.
/// </summary>
public sealed class CourierPaymentReceiptTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(db)
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options);

    private static async Task<Guid> SeedOrder(string db, Guid courierId, decimal salary)
    {
        using AppDbContext ctx = Ctx(db);
        Order o = new()
        {
            TrackingNumber    = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName     = "Recipient",
            RecipientPhone    = "555111222",
            RecipientCity     = "City",
            RecipientDistrict = "District",
            RecipientAddress  = "Some street 1",
            OrderType         = OrderType.Send,
            Status            = OrderStatus.DeliveredToRecipient,
            CourierId         = courierId,
            CourierSalary     = salary,
            CreatedAt         = CustomTime.Now,
        };
        ctx.Orders.Add(o);
        await ctx.SaveChangesAsync();
        return o.Id;
    }

    private static async Task Pay(string db, Guid courierId, CourierPaymentFlow flow, params (Guid orderId, decimal amount)[] allocs)
    {
        using AppDbContext ctx = Ctx(db);
        await new PayCourierOrdersCommandHandler(ctx).Handle(
            new PayCourierOrdersCommand(courierId, flow,
                allocs.Select(a => new CourierOrderPaymentAllocation(a.orderId, a.amount)).ToList()),
            CancellationToken.None);
    }

    [Fact]
    public async Task SalaryPayment_RecordsOneReceiptWithAllocations()
    {
        string db = $"courier-receipts-{Guid.NewGuid()}";
        Guid courierId = Guid.NewGuid();
        Guid a = await SeedOrder(db, courierId, 5m);
        Guid b = await SeedOrder(db, courierId, 7m);

        await Pay(db, courierId, CourierPaymentFlow.Salary, (a, 5m), (b, 3m));

        using AppDbContext ctx = Ctx(db);
        PaymentReceipt receipt = await ctx.PaymentReceipts.Include(r => r.Allocations).SingleAsync();
        Assert.Equal(PaymentReceiptFlow.CourierSalary, receipt.Flow);
        Assert.Equal(courierId, receipt.CourierId);
        Assert.Null(receipt.CustomerId);
        Assert.Equal(8m, receipt.TotalAmount);
        Assert.Equal(2, receipt.Allocations.Count);
        Assert.Equal(3m, (await ctx.Orders.SingleAsync(o => o.Id == b)).CourierSalaryPaidAmount);
    }

    [Fact]
    public async Task RecipientPaysCodTransfer_CreditsKeptSalary_SoSalaryIsNotOfferedTwice()
    {
        string db = $"courier-receipts-{Guid.NewGuid()}";
        Guid courierId = Guid.NewGuid();
        Guid id;
        using (AppDbContext seed = Ctx(db))
        {
            Order o = new()
            {
                TrackingNumber = "TN-KEEP-SAL", RecipientName = "R", RecipientPhone = "555111222",
                RecipientCity = "City", RecipientDistrict = "District", RecipientAddress = "Street 1",
                OrderType = OrderType.Send, Status = OrderStatus.DeliveredToRecipient,
                DeliveredAt = CustomTime.Now, CourierId = courierId,
                WhoPaysForCompanyService = ServicePayer.Recipient,
                AmountToCollectForPackage = 94m, CompanyServicePrice = 6m, CourierSalary = 5m,
                CreatedAt = CustomTime.Now,
            };
            seed.Orders.Add(o);
            await seed.SaveChangesAsync();
            id = o.Id;
        }

        await Pay(db, courierId, CourierPaymentFlow.CodTransfer, (id, 95m));   // 100 cash − 5 salary kept

        using AppDbContext ctx = Ctx(db);
        Order saved = await ctx.Orders.SingleAsync(o => o.Id == id);
        Assert.Equal(5m, saved.CourierSalaryPaidAmount);
        Assert.Equal(0m, Application.Finance.OrderFinance.CourierSalaryOutstanding(saved));
        await Assert.ThrowsAsync<ConflictException>(() => Pay(db, courierId, CourierPaymentFlow.Salary, (id, 5m)));
    }

    [Fact]
    public async Task RecipientPays_SalaryPaidFirst_HandOverIsFullCash_AndSalaryIsNotKeptToo()
    {
        string db = $"courier-receipts-{Guid.NewGuid()}";
        Guid courierId = Guid.NewGuid();
        Guid id;
        using (AppDbContext seed = Ctx(db))
        {
            Order o = new()
            {
                TrackingNumber = "TN-PAID-1ST", RecipientName = "R", RecipientPhone = "555111222",
                RecipientCity = "City", RecipientDistrict = "District", RecipientAddress = "Street 1",
                OrderType = OrderType.Send, Status = OrderStatus.DeliveredToRecipient,
                DeliveredAt = CustomTime.Now, CourierId = courierId,
                WhoPaysForCompanyService = ServicePayer.Recipient,
                AmountToCollectForPackage = 94m, CompanyServicePrice = 6m, CourierSalary = 5m,
                CreatedAt = CustomTime.Now,
            };
            seed.Orders.Add(o);
            await seed.SaveChangesAsync();
            id = o.Id;
        }

        await Pay(db, courierId, CourierPaymentFlow.Salary, (id, 5m));          // admin pays the salary first

        using (AppDbContext ctx = Ctx(db))
            Assert.Equal(100m, Application.Finance.OrderFinance.CourierCodTransferOutstanding(
                await ctx.Orders.SingleAsync(o => o.Id == id)));                // full cash, nothing kept
        await Assert.ThrowsAsync<ConflictException>(() => Pay(db, courierId, CourierPaymentFlow.CodTransfer, (id, 101m)));

        await Pay(db, courierId, CourierPaymentFlow.CodTransfer, (id, 100m));

        using AppDbContext after = Ctx(db);
        Order saved = await after.Orders.SingleAsync(o => o.Id == id);
        Assert.False(saved.IsCourierSalaryIncludedSpecialCase);
        Assert.Equal(5m, saved.CourierSalaryPaidAmount);
        Assert.Equal(0m, Application.Finance.OrderFinance.CourierCodTransferOutstanding(saved));
    }

    [Fact]
    public async Task SecondPayment_AddsASecondReceipt_AndOverpaymentIsRejected()
    {
        string db = $"courier-receipts-{Guid.NewGuid()}";
        Guid courierId = Guid.NewGuid();
        Guid a = await SeedOrder(db, courierId, 10m);

        await Pay(db, courierId, CourierPaymentFlow.Salary, (a, 4m));
        await Pay(db, courierId, CourierPaymentFlow.Salary, (a, 6m));

        // 10 already settled — a further payment exceeds the outstanding and must not leave a receipt.
        await Assert.ThrowsAsync<ConflictException>(() =>
            Pay(db, courierId, CourierPaymentFlow.Salary, (a, 1m)));

        using AppDbContext ctx = Ctx(db);
        Assert.Equal(2, await ctx.PaymentReceipts.CountAsync());
    }

    [Fact]
    public async Task ReceiptQuery_ScopesToTheCourier_AndIgnoresCustomerReceipts()
    {
        string db = $"courier-receipts-{Guid.NewGuid()}";
        Guid courierA = Guid.NewGuid();
        Guid courierB = Guid.NewGuid();
        Guid orderA = await SeedOrder(db, courierA, 5m);
        Guid orderB = await SeedOrder(db, courierB, 5m);
        await Pay(db, courierA, CourierPaymentFlow.Salary, (orderA, 5m));
        await Pay(db, courierB, CourierPaymentFlow.Salary, (orderB, 5m));

        using (AppDbContext seed = Ctx(db))
        {
            seed.PaymentReceipts.Add(new PaymentReceipt
            {
                CustomerId = Guid.NewGuid(), Flow = PaymentReceiptFlow.CodPayout, TotalAmount = 99m,
            });
            await seed.SaveChangesAsync();
        }

        using AppDbContext ctx = Ctx(db);
        GetCourierPaymentReceiptsQueryHandler handler = new(ctx);

        var mine = await handler.Handle(new GetCourierPaymentReceiptsQuery(courierA, null), CancellationToken.None);
        var all  = await handler.Handle(new GetCourierPaymentReceiptsQuery(null, null), CancellationToken.None);

        Assert.Single(mine);
        Assert.Equal(PaymentReceiptFlow.CourierSalary, mine[0].Flow);
        Assert.Equal(2, all.Count);   // both couriers, never the customer receipt
    }
}
