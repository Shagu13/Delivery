using Application.Couriers;
using Application.CustomerSettlements.Queries;
using Application.Settlements.DTOs;
using Application.Settlements.Queries;
using Domain;
using Domain.Enums;
using Persistence;
using CourierEntity = Domain.Courier;

namespace Application.UnitTests;

/// <summary>
/// Regional couriers (AssignedCity outside Tbilisi/Rustavi) are settled by the day orders were
/// assigned to them; Tbilisi/Rustavi couriers stay on the delivery day. The admin can override
/// per request. Covers the policy, the courier picker, the per-order lines and the day summaries.
/// </summary>
public sealed class CourierDateBasisTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(CustomTime.Today);

    private static CourierEntity AddCourier(AppDbContext ctx, string city)
    {
        CourierEntity courier = new()
        {
            FirstName = "Test", LastName = "Courier", IdNumber = "01001001001", PhoneNumber = "555000111",
            AssignedCity = city, AssignedDistrict = "District", ApplicationUserId = $"u-{Guid.NewGuid():N}",
        };
        ctx.Couriers.Add(courier);
        return courier;
    }

    private static Order AddOrder(
        AppDbContext ctx, Guid courierId, OrderStatus status, DateTime assignedAt, DateTime? deliveredAt, decimal salary = 5m)
    {
        Order order = new()
        {
            TrackingNumber           = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName            = "Recipient",
            RecipientPhone           = "555111222",
            RecipientCity            = "City",
            RecipientDistrict        = "District",
            RecipientAddress         = "Some street 1",
            OrderType                = OrderType.Send,
            Status                   = status,
            CourierId                = courierId,
            WhoPaysForCompanyService = ServicePayer.Recipient,
            ProductPaymentStatus     = PaymentStatus.Paid,
            CompanyServicePrice      = 8m,
            CourierSalary            = salary,
            AssignedToCourierAt      = assignedAt,
            DeliveredAt              = deliveredAt,
            AmountOfCashCollected    = deliveredAt is null ? null : 8m,
            CreatedAt                = assignedAt,
        };
        ctx.Orders.Add(order);
        return order;
    }

    [Theory]
    [InlineData("Tbilisi", CourierDateBasis.Delivered)]
    [InlineData("Rustavi", CourierDateBasis.Delivered)]
    [InlineData(" rustavi ", CourierDateBasis.Delivered)]
    [InlineData("Kutaisi", CourierDateBasis.Assigned)]
    [InlineData("Batumi", CourierDateBasis.Assigned)]
    public void Default_basis_follows_assigned_city(string city, CourierDateBasis expected) =>
        Assert.Equal(expected, CourierDateBasisPolicy.DefaultFor(city));

    // ── Courier picker ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Picker_lists_regional_courier_by_assignment_and_tbilisi_courier_by_delivery()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity regional = AddCourier(ctx, "Kutaisi");
        CourierEntity capital  = AddCourier(ctx, "Tbilisi");
        CourierEntity capitalIdle = AddCourier(ctx, "Tbilisi");
        DateTime now = CustomTime.Now;

        // Regional: assigned today, nothing delivered yet → listed. Tbilisi: delivered today → listed.
        AddOrder(ctx, regional.Id, OrderStatus.CourierAssignedToDeliver, now, null);
        AddOrder(ctx, capital.Id, OrderStatus.DeliveredToRecipient, now.AddDays(-3), now);
        // Tbilisi courier merely assigned today, undelivered → not listed (delivery basis).
        AddOrder(ctx, capitalIdle.Id, OrderStatus.CourierAssignedToDeliver, now, null);
        await ctx.SaveChangesAsync();

        IReadOnlyList<Guid> ids = await new GetCouriersWithDeliveriesOnDateQueryHandler(ctx)
            .Handle(new GetCouriersWithDeliveriesOnDateQuery(Today), CancellationToken.None);

        Assert.Contains(regional.Id, ids);
        Assert.Contains(capital.Id, ids);
        Assert.DoesNotContain(capitalIdle.Id, ids);
    }

    [Fact]
    public async Task Picker_ignores_regional_courier_delivery_day_when_assigned_earlier()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity regional = AddCourier(ctx, "Kutaisi");
        DateTime now = CustomTime.Now;
        AddOrder(ctx, regional.Id, OrderStatus.DeliveredToRecipient, now.AddDays(-4), now);
        await ctx.SaveChangesAsync();

        IReadOnlyList<Guid> ids = await new GetCouriersWithDeliveriesOnDateQueryHandler(ctx)
            .Handle(new GetCouriersWithDeliveriesOnDateQuery(Today), CancellationToken.None);

        Assert.DoesNotContain(regional.Id, ids);
    }

    // ── Per-order lines ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Lines_default_to_assignment_day_for_regional_courier_and_include_open_orders()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity regional = AddCourier(ctx, "Kutaisi");
        DateTime now = CustomTime.Now;
        AddOrder(ctx, regional.Id, OrderStatus.DeliveredToRecipient, now, now);
        AddOrder(ctx, regional.Id, OrderStatus.CourierAssignedToDeliver, now, null);
        AddOrder(ctx, regional.Id, OrderStatus.DeliveredToRecipient, now.AddDays(-5), now);   // other batch, delivered today
        await ctx.SaveChangesAsync();

        var handler = new GetCourierOrderFinanceLinesQueryHandler(ctx);
        var lines = await handler.Handle(new GetCourierOrderFinanceLinesQuery(regional.Id, Today), CancellationToken.None);

        Assert.Equal(2, lines.Count);   // today's batch (delivered + open); the older batch is excluded
    }

    [Fact]
    public async Task Lines_explicit_delivered_basis_overrides_the_regional_default()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity regional = AddCourier(ctx, "Kutaisi");
        DateTime now = CustomTime.Now;
        AddOrder(ctx, regional.Id, OrderStatus.DeliveredToRecipient, now, now);
        AddOrder(ctx, regional.Id, OrderStatus.CourierAssignedToDeliver, now, null);
        AddOrder(ctx, regional.Id, OrderStatus.DeliveredToRecipient, now.AddDays(-5), now);
        await ctx.SaveChangesAsync();

        var handler = new GetCourierOrderFinanceLinesQueryHandler(ctx);
        var lines = await handler.Handle(
            new GetCourierOrderFinanceLinesQuery(regional.Id, Today, Basis: CourierDateBasis.Delivered), CancellationToken.None);

        Assert.Equal(2, lines.Count);   // the two delivered today, whichever day they were assigned
        Assert.All(lines, l => Assert.NotNull(l.DeliveredAt));
    }

    [Fact]
    public async Task Lines_for_tbilisi_courier_stay_on_delivery_day()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity capital = AddCourier(ctx, "Tbilisi");
        DateTime now = CustomTime.Now;
        AddOrder(ctx, capital.Id, OrderStatus.DeliveredToRecipient, now.AddDays(-2), now);
        AddOrder(ctx, capital.Id, OrderStatus.CourierAssignedToDeliver, now, null);   // assigned today but undelivered
        await ctx.SaveChangesAsync();

        var handler = new GetCourierOrderFinanceLinesQueryHandler(ctx);
        var lines = await handler.Handle(new GetCourierOrderFinanceLinesQuery(capital.Id, Today), CancellationToken.None);

        Assert.Single(lines);
        Assert.NotNull(lines[0].DeliveredAt);
    }

    // ── Day summaries ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Summary_for_regional_courier_groups_by_assignment_day_and_counts_only_delivered_money()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity regional = AddCourier(ctx, "Kutaisi");
        DateTime now = CustomTime.Now;
        AddOrder(ctx, regional.Id, OrderStatus.DeliveredToRecipient, now, now, salary: 5m);
        AddOrder(ctx, regional.Id, OrderStatus.CourierAssignedToDeliver, now, null, salary: 7m);
        AddOrder(ctx, regional.Id, OrderStatus.DeliveryPostponed, now, null, salary: 9m);
        await ctx.SaveChangesAsync();

        var days = await CourierSettlementProjection.BuildAsync(
            ctx, regional.Id, CustomTime.Today, CustomTime.Today.AddDays(1), CancellationToken.None);

        CourierSettlementItemDto day = Assert.Single(days);
        Assert.Equal("Assigned", day.DateBasis);
        Assert.Equal(3, day.TotalOrdersAssigned);
        Assert.Equal(1, day.TotalOrdersDelivered);
        Assert.Equal(1, day.NumberOfOrderPostponed);
        Assert.Equal(5m, day.TotalCourierSalary);   // open orders earned nothing yet
    }

    [Fact]
    public async Task Summary_for_regional_courier_keeps_a_batch_on_its_assignment_day_after_late_delivery()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity regional = AddCourier(ctx, "Kutaisi");
        DateTime now = CustomTime.Now;
        AddOrder(ctx, regional.Id, OrderStatus.DeliveredToRecipient, now.AddDays(-3), now);   // assigned 3 days ago, delivered today
        await ctx.SaveChangesAsync();

        var days = await CourierSettlementProjection.BuildAsync(
            ctx, regional.Id, CustomTime.Today.AddDays(-30), CustomTime.Today.AddDays(1), CancellationToken.None);

        CourierSettlementItemDto day = Assert.Single(days);
        Assert.Equal(CustomTime.Today.AddDays(-3).ToString("yyyy-MM-dd"), day.Date);
        Assert.Equal(1, day.TotalOrdersDelivered);
    }

    [Fact]
    public async Task Summary_for_tbilisi_courier_stays_on_delivery_day()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity capital = AddCourier(ctx, "Tbilisi");
        DateTime now = CustomTime.Now;
        AddOrder(ctx, capital.Id, OrderStatus.DeliveredToRecipient, now.AddDays(-3), now);
        await ctx.SaveChangesAsync();

        var days = await CourierSettlementProjection.BuildAsync(
            ctx, capital.Id, CustomTime.Today.AddDays(-30), CustomTime.Today.AddDays(1), CancellationToken.None);

        CourierSettlementItemDto day = Assert.Single(days);
        Assert.Equal("Delivered", day.DateBasis);
        Assert.Equal(CustomTime.Today.ToString("yyyy-MM-dd"), day.Date);
    }
}
