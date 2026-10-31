using Application.CustomerSettlements.Queries;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// The admin settlement modal's "All Unpaid" view: every order of a courier, of ANY date, whose leg is done but
/// whose salary or cash is still open. Settled orders, open (undelivered) orders and other couriers' orders stay out.
/// </summary>
public sealed class CourierUnsettledTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(db).Options);

    private static Order Make(Guid courierId, ServicePayer payer, decimal cash, decimal salary, DateTime? deliveredAt) => new()
    {
        TrackingNumber            = $"TN-{Guid.NewGuid():N}"[..12],
        RecipientName             = "Recipient",
        RecipientPhone            = "555111222",
        RecipientCity             = "City",
        RecipientDistrict         = "District",
        RecipientAddress          = "Some street 1",
        OrderType                 = OrderType.Send,
        Status                    = deliveredAt is null ? OrderStatus.CourierAssignedToDeliver : OrderStatus.DeliveredToRecipient,
        WhoPaysForCompanyService  = payer,
        ProductPaymentStatus      = PaymentStatus.Paid,
        CompanyServicePrice       = 9m,
        AmountToCollectForPackage = payer == ServicePayer.Sender ? cash : Math.Max(0m, cash - 9m),
        AmountOfCashCollected     = cash,
        CourierSalary             = salary,
        CourierId                 = courierId,
        AssignedToCourierAt       = CustomTime.Now.AddDays(-20),
        DeliveredAt               = deliveredAt,
        CreatedAt                 = CustomTime.Now,
    };

    [Fact]
    public async Task ReturnsOnlyOpenOrdersOfThisCourier_FromAnyDate()
    {
        string db = $"unsettled-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        Guid unsettledId, partialId;

        using (AppDbContext ctx = Ctx(db))
        {
            Order unsettledOld = Make(courier, ServicePayer.Sender, cash: 50m, salary: 4m, CustomTime.Now.AddDays(-12));   // nothing paid
            Order partial      = Make(courier, ServicePayer.Sender, cash: 50m, salary: 4m, CustomTime.Now.AddDays(-1));    // salary paid, cash 48/50 handed
            partial.CourierSalaryPaidAmount        = 4m;
            partial.CodTransferedToCompanyByCourier = 48m;
            Order settled = Make(courier, ServicePayer.Sender, cash: 50m, salary: 4m, CustomTime.Now.AddDays(-2));         // all done
            settled.CourierSalaryPaidAmount        = 4m;
            settled.CodTransferedToCompanyByCourier = 50m;
            Order keptSettled = Make(courier, ServicePayer.Recipient, cash: 100m, salary: 4m, CustomTime.Now.AddDays(-3)); // salary kept, hand-over net
            keptSettled.IsCourierSalaryIncludedSpecialCase = true;
            keptSettled.CourierSalaryPaidAmount           = 4m;
            keptSettled.CodTransferedToCompanyByCourier   = 96m;
            Order open  = Make(courier, ServicePayer.Sender, cash: 50m, salary: 4m, deliveredAt: null);                    // not delivered yet
            Order other = Make(Guid.NewGuid(), ServicePayer.Sender, cash: 50m, salary: 4m, CustomTime.Now.AddDays(-5));    // another courier

            ctx.Orders.AddRange(unsettledOld, partial, settled, keptSettled, open, other);
            await ctx.SaveChangesAsync();
            unsettledId = unsettledOld.Id;
            partialId   = partial.Id;
        }

        using AppDbContext read = Ctx(db);
        var lines = await new GetCourierOrderFinanceLinesQueryHandler(read).Handle(
            new GetCourierOrderFinanceLinesQuery(courier, Date: null, OnlyUnsettled: true), CancellationToken.None);

        Assert.Equal(2, lines.Count);
        Assert.Contains(lines, l => l.OrderId == unsettledId);
        Assert.Contains(lines, l => l.OrderId == partialId);   // newest first
        Assert.Equal(partialId, lines[0].OrderId);
    }

    [Fact]
    public async Task BillableFailedDelivery_IsIncluded_EvenWithoutAnyDate_ButNonBillableAndPostponedAreNot()
    {
        string db = $"unsettled-billable-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        Guid billableId;

        using (AppDbContext ctx = Ctx(db))
        {
            Order billable = Make(courier, ServicePayer.Sender, cash: 0m, salary: 4m, deliveredAt: null);
            billable.Status             = OrderStatus.CancelledByAdmin;
            billable.CancellationReason = CancellationReason.DidNotLike;     // billable; no DeliveredAt / CancelledAt (legacy row)
            Order nonBillable = Make(courier, ServicePayer.Sender, cash: 0m, salary: 4m, deliveredAt: null);
            nonBillable.Status             = OrderStatus.CancelledByAdmin;
            nonBillable.CancellationReason = CancellationReason.DidNotWant;  // no delivery service rendered
            Order postponed = Make(courier, ServicePayer.Sender, cash: 50m, salary: 4m, deliveredAt: null);
            postponed.Status = OrderStatus.DeliveryPostponed;
            postponed.PostponedAt = CustomTime.Now;

            ctx.Orders.AddRange(billable, nonBillable, postponed);
            await ctx.SaveChangesAsync();
            billableId = billable.Id;
        }

        using AppDbContext read = Ctx(db);
        var lines = await new GetCourierOrderFinanceLinesQueryHandler(read).Handle(
            new GetCourierOrderFinanceLinesQuery(courier, Date: null, OnlyUnsettled: true), CancellationToken.None);

        Assert.Single(lines);
        Assert.Equal(billableId, lines[0].OrderId);
    }

    [Fact]
    public async Task DeliveredOrderWithNoSalary_IsIncludedAndFlagged_ButNotWhenStillUndelivered()
    {
        string db = $"unsettled-nosalary-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        Guid nullSalaryId, zeroSalaryId;

        using (AppDbContext ctx = Ctx(db))
        {
            Order nullSalary = Make(courier, ServicePayer.Sender, cash: 0m, salary: 0m, CustomTime.Now.AddDays(-4));
            nullSalary.CourierSalary = null;                                   // never entered
            Order zeroSalary = Make(courier, ServicePayer.Sender, cash: 0m, salary: 0m, CustomTime.Now.AddDays(-3));   // entered as 0
            Order openNoSalary = Make(courier, ServicePayer.Sender, cash: 0m, salary: 0m, deliveredAt: null);          // not delivered yet
            openNoSalary.CourierSalary = null;
            Order paidInFull = Make(courier, ServicePayer.Sender, cash: 0m, salary: 4m, CustomTime.Now.AddDays(-2));   // has a salary, fully paid
            paidInFull.CourierSalaryPaidAmount = 4m;

            ctx.Orders.AddRange(nullSalary, zeroSalary, openNoSalary, paidInFull);
            await ctx.SaveChangesAsync();
            nullSalaryId = nullSalary.Id;
            zeroSalaryId = zeroSalary.Id;
        }

        using AppDbContext read = Ctx(db);
        var lines = await new GetCourierOrderFinanceLinesQueryHandler(read).Handle(
            new GetCourierOrderFinanceLinesQuery(courier, Date: null, OnlyUnsettled: true), CancellationToken.None);

        Assert.Equal(2, lines.Count);
        Assert.All(lines, l => Assert.True(l.IsCourierSalaryMissing));
        Assert.Contains(lines, l => l.OrderId == nullSalaryId);
        Assert.Contains(lines, l => l.OrderId == zeroSalaryId);
    }

    [Fact]
    public async Task IgnoresTheDateArgument()
    {
        string db = $"unsettled-date-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        using (AppDbContext ctx = Ctx(db))
        {
            ctx.Orders.Add(Make(courier, ServicePayer.Sender, cash: 0m, salary: 4m, CustomTime.Now.AddDays(-30)));
            await ctx.SaveChangesAsync();
        }

        using AppDbContext read = Ctx(db);
        var lines = await new GetCourierOrderFinanceLinesQueryHandler(read).Handle(
            new GetCourierOrderFinanceLinesQuery(courier, DateOnly.FromDateTime(CustomTime.Today), OnlyUnsettled: true),
            CancellationToken.None);

        Assert.Single(lines);
    }
}
