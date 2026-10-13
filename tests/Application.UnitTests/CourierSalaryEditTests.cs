using Application.Orders.Commands;
using Application.Settlements.Commands;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// Editing an order's courier salary below what was already paid trims the stored salary
/// receipts so history, the order's paid amount and the receipt totals stay consistent.
/// </summary>
public sealed class CourierSalaryEditTests
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

    [Fact]
    public async Task LoweringSalaryBelowPaid_TrimsOrderAndReceipts()
    {
        string db = $"salary-edit-{Guid.NewGuid()}";
        Guid courierId = Guid.NewGuid();
        Guid orderId = await SeedOrder(db, courierId, 20m);

        using (AppDbContext ctx = Ctx(db))
            await new PayCourierOrdersCommandHandler(ctx).Handle(
                new PayCourierOrdersCommand(courierId, CourierPaymentFlow.Salary,
                    new[] { new CourierOrderPaymentAllocation(orderId, 20m) }),
                CancellationToken.None);

        using (AppDbContext ctx = Ctx(db))
            await new SetCourierSalaryCommandHandler(ctx).Handle(
                new SetCourierSalaryCommand(orderId, 12m), CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Order order = await verify.Orders.SingleAsync(o => o.Id == orderId);
        Assert.Equal(12m, order.CourierSalary);
        Assert.Equal(12m, order.CourierSalaryPaidAmount);

        PaymentReceipt receipt = await verify.PaymentReceipts.Include(r => r.Allocations).SingleAsync();
        Assert.Equal(12m, receipt.TotalAmount);
        Assert.Equal(12m, receipt.Allocations.Single().Amount);
    }

    [Fact]
    public async Task RaisingSalary_LeavesPaymentsUntouched()
    {
        string db = $"salary-raise-{Guid.NewGuid()}";
        Guid courierId = Guid.NewGuid();
        Guid orderId = await SeedOrder(db, courierId, 10m);

        using (AppDbContext ctx = Ctx(db))
            await new PayCourierOrdersCommandHandler(ctx).Handle(
                new PayCourierOrdersCommand(courierId, CourierPaymentFlow.Salary,
                    new[] { new CourierOrderPaymentAllocation(orderId, 10m) }),
                CancellationToken.None);

        using (AppDbContext ctx = Ctx(db))
            await new SetCourierSalaryCommandHandler(ctx).Handle(
                new SetCourierSalaryCommand(orderId, 15m), CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Order order = await verify.Orders.SingleAsync(o => o.Id == orderId);
        Assert.Equal(10m, order.CourierSalaryPaidAmount);
        Assert.Equal(10m, (await verify.PaymentReceipts.SingleAsync()).TotalAmount);
    }
}
