using Application.Common.Exceptions;
using Application.Orders.Commands.SetCourierSalaryBulk;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Persistence;

namespace Application.UnitTests;

/// <summary>Couriers → Edit salary: one salary on many orders, all-or-nothing, with paid-salary receipts kept consistent.</summary>
public sealed class SetCourierSalaryBulkTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(db)
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options);

    private static Order NewOrder(decimal fee, decimal? salary = null, decimal? paid = null) => new()
    {
        TrackingNumber          = $"TN-{Guid.NewGuid():N}"[..12],
        RecipientName           = "Recipient",
        RecipientPhone          = "555111222",
        RecipientCity           = "City",
        RecipientDistrict       = "District",
        RecipientAddress        = "Some street 1",
        OrderType               = OrderType.Send,
        Status                  = OrderStatus.CourierAssignedToDeliver,
        CompanyServicePrice     = fee,
        CourierSalary           = salary,
        CourierSalaryPaidAmount = paid,
        CourierSalaryPaidAt     = paid is null ? null : CustomTime.Now,
    };

    [Fact]
    public async Task Sets_salary_and_revenue_only_on_the_listed_orders()
    {
        string db = nameof(Sets_salary_and_revenue_only_on_the_listed_orders);
        Order a = NewOrder(8m), b = NewOrder(10m, salary: 3m), untouched = NewOrder(8m, salary: 2m);
        await using (AppDbContext seed = Ctx(db)) { seed.Orders.AddRange(a, b, untouched); await seed.SaveChangesAsync(); }

        await using AppDbContext ctx = Ctx(db);
        int updated = await new SetCourierSalaryBulkCommandHandler(ctx)
            .Handle(new SetCourierSalaryBulkCommand(new[] { a.Id, b.Id }, 4m), default);

        Assert.Equal(2, updated);
        Order ra = await ctx.Orders.SingleAsync(o => o.Id == a.Id);
        Order rb = await ctx.Orders.SingleAsync(o => o.Id == b.Id);
        Order ru = await ctx.Orders.SingleAsync(o => o.Id == untouched.Id);
        Assert.Equal((decimal?)4m, ra.CourierSalary); Assert.Equal((decimal?)4m, ra.CompanyRevenue);
        Assert.Equal((decimal?)4m, rb.CourierSalary); Assert.Equal((decimal?)6m, rb.CompanyRevenue);
        Assert.Equal((decimal?)2m, ru.CourierSalary);
    }

    [Fact]
    public async Task Lowering_below_the_paid_amount_caps_it_and_trims_the_receipt_in_one_pass()
    {
        string db = nameof(Lowering_below_the_paid_amount_caps_it_and_trims_the_receipt_in_one_pass);
        Order x = NewOrder(8m, salary: 5m, paid: 5m), y = NewOrder(8m, salary: 6m, paid: 6m);
        PaymentReceipt receipt = new() { CourierId = Guid.NewGuid(), Flow = PaymentReceiptFlow.CourierSalary, TotalAmount = 11m, PaidAt = CustomTime.Now };
        await using (AppDbContext seed = Ctx(db))
        {
            seed.Orders.AddRange(x, y);
            receipt.Allocations.Add(new PaymentReceiptAllocation { OrderId = x.Id, Amount = 5m });
            receipt.Allocations.Add(new PaymentReceiptAllocation { OrderId = y.Id, Amount = 6m });
            seed.PaymentReceipts.Add(receipt);
            await seed.SaveChangesAsync();
        }

        await using AppDbContext ctx = Ctx(db);
        await new SetCourierSalaryBulkCommandHandler(ctx)
            .Handle(new SetCourierSalaryBulkCommand(new[] { x.Id, y.Id }, 4m), default);

        Assert.Equal((decimal?)4m, (await ctx.Orders.SingleAsync(o => o.Id == x.Id)).CourierSalaryPaidAmount);
        Assert.Equal((decimal?)4m, (await ctx.Orders.SingleAsync(o => o.Id == y.Id)).CourierSalaryPaidAmount);
        PaymentReceipt r = await ctx.PaymentReceipts.Include(p => p.Allocations).SingleAsync();
        Assert.Equal(8m, r.TotalAmount);
        Assert.All(r.Allocations, al => Assert.Equal(4m, al.Amount));
    }

    [Fact]
    public async Task A_salary_above_any_fee_refuses_the_whole_request()
    {
        string db = nameof(A_salary_above_any_fee_refuses_the_whole_request);
        Order cheap = NewOrder(3m), fine = NewOrder(8m);
        await using (AppDbContext seed = Ctx(db)) { seed.Orders.AddRange(cheap, fine); await seed.SaveChangesAsync(); }

        await using AppDbContext ctx = Ctx(db);
        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() =>
            new SetCourierSalaryBulkCommandHandler(ctx).Handle(new SetCourierSalaryBulkCommand(new[] { cheap.Id, fine.Id }, 5m), default));

        Assert.Contains(cheap.TrackingNumber, ex.Errors["Salary"][0]);
        Assert.Null((await ctx.Orders.SingleAsync(o => o.Id == fine.Id)).CourierSalary);
    }

    [Fact]
    public async Task An_unknown_order_id_is_a_404()
    {
        await using AppDbContext ctx = Ctx(nameof(An_unknown_order_id_is_a_404));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            new SetCourierSalaryBulkCommandHandler(ctx).Handle(new SetCourierSalaryBulkCommand(new[] { Guid.NewGuid() }, 1m), default));
    }
}
