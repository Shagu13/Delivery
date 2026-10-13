using Application.GroupOrders.Queries.GetAdminMonthlyStats;
using Domain;
using Domain.Enums;
using Persistence;
using CourierEntity = Domain.Courier;

namespace Application.UnitTests;

/// <summary>
/// Admin Overview monthly statistics: which orders fall in the month (by CreatedAt), how
/// statuses collapse into the five pie buckets, and the optional order-type filter.
/// </summary>
public sealed class AdminMonthlyStatsTests
{
    [Theory]
    [InlineData(OrderStatus.DeliveredToRecipient, MonthlyStatusGroup.Delivered)]
    [InlineData(OrderStatus.AllDelivered,         MonthlyStatusGroup.Delivered)]
    [InlineData(OrderStatus.ExchangeCompleted,    MonthlyStatusGroup.Delivered)]
    [InlineData(OrderStatus.DeliveryPostponed,    MonthlyStatusGroup.Postponed)]
    [InlineData(OrderStatus.CancelledBySender,    MonthlyStatusGroup.Cancelled)]
    [InlineData(OrderStatus.CancelledByAdmin,     MonthlyStatusGroup.Cancelled)]
    [InlineData(OrderStatus.OrderNotAccepted,     MonthlyStatusGroup.Cancelled)]
    [InlineData(OrderStatus.ReturnedToSender,     MonthlyStatusGroup.Returned)]
    [InlineData(OrderStatus.Pending,              MonthlyStatusGroup.Active)]
    [InlineData(OrderStatus.CourierAssignedToDeliver, MonthlyStatusGroup.Active)]
    [InlineData(OrderStatus.PickedUpFromRecipient,    MonthlyStatusGroup.Active)]
    [InlineData(OrderStatus.DeliveredReturnOrderToWarehouse, MonthlyStatusGroup.Active)]
    public void Status_maps_to_its_bucket(OrderStatus status, MonthlyStatusGroup expected) =>
        Assert.Equal(expected, GetAdminMonthlyStatsQueryHandler.GroupOf(status));

    [Fact]
    public async Task Only_orders_created_in_the_month_are_counted()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        ctx.Orders.AddRange(
            NewOrder(new DateTime(2026, 9, 30, 23, 59, 0), OrderStatus.DeliveredToRecipient), // before
            NewOrder(new DateTime(2026, 10, 1, 0, 0, 0),   OrderStatus.DeliveredToRecipient), // first instant
            NewOrder(new DateTime(2026, 10, 31, 23, 59, 0), OrderStatus.Pending),             // last minute
            NewOrder(new DateTime(2026, 11, 1, 0, 0, 0),   OrderStatus.Pending));             // after
        await ctx.SaveChangesAsync();

        AdminMonthlyStatsDto result = await Run(ctx, 2026, 10, null);

        Assert.Equal(2, result.Total);
        Assert.Equal(new[] { 1, 31 }, result.Days.Select(d => d.Day).OrderBy(d => d).ToArray());
    }

    [Fact]
    public async Task Statuses_in_one_bucket_are_summed_per_day_and_city()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        DateTime day = new(2026, 10, 5, 12, 0, 0);
        ctx.Orders.AddRange(
            NewOrder(day, OrderStatus.CancelledByAdmin),
            NewOrder(day, OrderStatus.CancelledBySender),
            NewOrder(day, OrderStatus.DeliveredToRecipient));
        await ctx.SaveChangesAsync();

        AdminMonthlyStatsDto result = await Run(ctx, 2026, 10, null);

        Assert.Equal(2, result.Days.Single(d => d.Group == MonthlyStatusGroup.Cancelled).Count);
        Assert.Equal(2, result.Cities.Single(c => c.Group == MonthlyStatusGroup.Cancelled).Count);
        Assert.Equal(3, result.Statuses.Sum(s => s.Count));
    }

    [Fact]
    public async Task Type_filter_narrows_every_list()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        DateTime day = new(2026, 10, 5);
        ctx.Orders.AddRange(
            NewOrder(day, OrderStatus.DeliveredToRecipient, OrderType.Send),
            NewOrder(day, OrderStatus.DeliveredToRecipient, OrderType.Send),
            NewOrder(day, OrderStatus.ReturnedToSender, OrderType.Return));
        await ctx.SaveChangesAsync();

        AdminMonthlyStatsDto returns = await Run(ctx, 2026, 10, OrderType.Return);

        Assert.Equal(1, returns.Total);
        Assert.Equal(MonthlyStatusGroup.Returned, Assert.Single(returns.Statuses).Group);
    }

    [Fact]
    public async Task Courier_list_skips_unassigned_orders_and_carries_the_name()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = new()
        {
            FirstName = "Gio", LastName = "Beridze", IdNumber = "01001", PhoneNumber = "555000111",
            AssignedCity = "City", AssignedDistrict = "District", ApplicationUserId = "u1",
        };
        ctx.Couriers.Add(courier);
        Order assigned = NewOrder(new DateTime(2026, 10, 5), OrderStatus.DeliveredToRecipient);
        assigned.CourierId = courier.Id;
        ctx.Orders.AddRange(assigned, NewOrder(new DateTime(2026, 10, 5), OrderStatus.Pending));
        await ctx.SaveChangesAsync();

        AdminMonthlyStatsDto result = await Run(ctx, 2026, 10, null);

        MonthlyCourierCountDto row = Assert.Single(result.Couriers);
        Assert.Equal("Gio Beridze", row.CourierName);
        Assert.Equal(MonthlyStatusGroup.Delivered, row.Group);
    }

    [Theory]
    [InlineData(1999, 5)]
    [InlineData(2026, 0)]
    [InlineData(2026, 13)]
    public void Validator_rejects_out_of_range_month_or_year(int year, int month) =>
        Assert.False(new GetAdminMonthlyStatsQueryValidator()
            .Validate(new GetAdminMonthlyStatsQuery(year, month, null)).IsValid);

    private static Task<AdminMonthlyStatsDto> Run(AppDbContext ctx, int year, int month, OrderType? type) =>
        new GetAdminMonthlyStatsQueryHandler(ctx)
            .Handle(new GetAdminMonthlyStatsQuery(year, month, type), CancellationToken.None);

    private static Order NewOrder(DateTime createdAt, OrderStatus status, OrderType type = OrderType.Send) => new()
    {
        TrackingNumber    = $"TN-{Guid.NewGuid():N}"[..12],
        RecipientName     = "Recipient",
        RecipientPhone    = "555111222",
        RecipientCity     = "Tbilisi",
        RecipientDistrict = "Central",
        RecipientAddress  = "Some street 1",
        OrderType         = type,
        Status            = status,
        CreatedAt         = createdAt,
    };
}
