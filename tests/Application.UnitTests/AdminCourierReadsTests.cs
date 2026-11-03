using Application.Calculator.DTOs;
using Application.Calculator.Queries.CalculatePrice;
using Application.Couriers.Queries.Admin;
using Domain;
using Domain.Enums;
using Persistence;
using CourierEntity = Domain.Courier;

namespace Application.UnitTests;

/// <summary>
/// The reads moved out of <c>CouriersController</c> / <c>CalculatorController</c> into handlers:
/// the assigned-day rule (shared by the Couriers-page list and its Excel export), operator revenue
/// hiding, and the public price calculator's waterfall.
/// </summary>
public sealed class AdminCourierReadsTests
{
    private static CourierEntity AddCourier(AppDbContext ctx)
    {
        CourierEntity courier = new()
        {
            FirstName = "Cou", LastName = "Rier", IdNumber = "01001",
            PhoneNumber = "555000111", AssignedCity = "City", AssignedDistrict = "District",
            ApplicationUserId = Guid.NewGuid().ToString(),
        };
        ctx.Couriers.Add(courier);
        return courier;
    }

    private static Order AddOrder(AppDbContext ctx, Guid? courierId, DateTime assignedAt,
        OrderStatus status = OrderStatus.CourierAssignedToDeliver) =>
        ctx.Orders.Add(new Order
        {
            TrackingNumber      = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName       = "Recipient",
            RecipientPhone      = "555111222",
            RecipientCity       = "City",
            RecipientDistrict   = "District",
            RecipientAddress    = "Some street 1",
            Status              = status,
            CourierId           = courierId,
            AssignedToCourierAt = assignedAt,
            CompanyServicePrice = 7m,
            CompanyRevenue      = 2m,
            CreatedAt           = assignedAt,
        }).Entity;

    private static Task<IReadOnlyList<AssignedOrderDto>> Assigned(AppDbContext ctx, DateTime day,
        bool includePrevious = true, bool hideRevenue = false) =>
        new GetAssignedOrdersForDayQueryHandler(ctx).Handle(
            new GetAssignedOrdersForDayQuery(day, includePrevious, hideRevenue), CancellationToken.None);

    [Fact]
    public async Task Today_carries_over_open_orders_from_earlier_days_unless_switched_off()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = AddCourier(ctx);
        DateTime today = CustomTime.Today;
        AddOrder(ctx, courier.Id, today.AddHours(10));                                         // today
        AddOrder(ctx, courier.Id, today.AddDays(-2), OrderStatus.DeliveryPostponed);           // open, earlier
        AddOrder(ctx, courier.Id, today.AddDays(-2), OrderStatus.DeliveredToRecipient);        // closed, earlier
        AddOrder(ctx, courierId: null, today.AddHours(9));                                     // no courier
        await ctx.SaveChangesAsync();

        Assert.Equal(2, (await Assigned(ctx, today)).Count);
        Assert.Single(await Assigned(ctx, today, includePrevious: false));
    }

    [Fact]
    public async Task Past_day_never_carries_over()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = AddCourier(ctx);
        DateTime pastDay = CustomTime.Today.AddDays(-1);
        AddOrder(ctx, courier.Id, pastDay.AddHours(12));
        AddOrder(ctx, courier.Id, pastDay.AddDays(-3), OrderStatus.CourierAssignedToDeliver);
        await ctx.SaveChangesAsync();

        Assert.Single(await Assigned(ctx, pastDay));
    }

    [Fact]
    public async Task Export_lists_the_same_orders_as_the_day_list_for_that_courier()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity a = AddCourier(ctx);
        CourierEntity b = AddCourier(ctx);
        DateTime today = CustomTime.Today;
        AddOrder(ctx, a.Id, today.AddHours(10));
        AddOrder(ctx, a.Id, today.AddDays(-1), OrderStatus.CourierDeliveringTheOrderToRecipient);
        AddOrder(ctx, b.Id, today.AddHours(11));
        await ctx.SaveChangesAsync();

        AssignedOrdersExportDto export = await new GetAssignedOrdersExportQueryHandler(ctx).Handle(
            new GetAssignedOrdersExportQuery(today, a.Id, IncludePrevious: true, GeorgianNames: false), CancellationToken.None);

        int listed = (await Assigned(ctx, today)).Count(o => o.CourierId == a.Id);
        Assert.Equal(listed, export.Rows.Count);
        Assert.Equal("Cou Rier", export.CourierName);
    }

    [Fact]
    public async Task Operators_never_see_company_revenue()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = AddCourier(ctx);
        AddOrder(ctx, courier.Id, CustomTime.Today.AddHours(10));
        await ctx.SaveChangesAsync();

        Assert.Equal(2m, (await Assigned(ctx, CustomTime.Today))[0].CompanyRevenue);
        Assert.Null((await Assigned(ctx, CustomTime.Today, hideRevenue: true))[0].CompanyRevenue);

        var handler = new GetAdminCourierOrdersQueryHandler(ctx);
        Assert.Null((await handler.Handle(new GetAdminCourierOrdersQuery(courier.Id, true), CancellationToken.None))![0].CompanyRevenue);
        Assert.Null(await handler.Handle(new GetAdminCourierOrdersQuery(Guid.NewGuid(), false), CancellationToken.None));
    }

    // ── Price calculator ─────────────────────────────────────────────────────────

    private static Task<CalculatedPriceDto?> Price(AppDbContext ctx, Guid district,
        Guid? tier = null, Guid? from = null, Guid? customer = null) =>
        new CalculatePriceQueryHandler(ctx).Handle(
            new CalculatePriceQuery(district, tier, from, customer), CancellationToken.None);

    [Fact]
    public async Task Calculator_applies_swap_customer_tiers_special_price_and_weight_override()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        District capital = TestSupport.Dist("Tbilisi", 6m, capital: true);
        District rustavi = TestSupport.Dist("Rustavi", 9m, city: true);
        District village = TestSupport.Dist("Village", 12m);
        Customer customer = TestSupport.Cust(capital: 5m, city: 8m);
        WeightPriceTier heavy = TestSupport.Tier(capital: 15m, city: 18m, district: 20m);
        ctx.AddRange(capital, rustavi, village, customer, heavy);
        await ctx.SaveChangesAsync();

        Assert.Null(await Price(ctx, Guid.NewGuid()));                                           // unknown district → 404
        Assert.Equal(new CalculatedPriceDto(6m, "default"), await Price(ctx, capital.Id));
        Assert.Equal(new CalculatedPriceDto(9m, "default"), await Price(ctx, capital.Id, from: rustavi.Id));   // swap into capital
        Assert.Equal(new CalculatedPriceDto(12m, "default"), await Price(ctx, village.Id, from: rustavi.Id));  // no swap out of capital
        Assert.Equal(new CalculatedPriceDto(5m, "capital"), await Price(ctx, capital.Id, from: rustavi.Id, customer: customer.Id)); // negotiated follows destination
        Assert.Equal(new CalculatedPriceDto(12m, "default"), await Price(ctx, village.Id, customer: customer.Id)); // no district tier set
        Assert.Equal(new CalculatedPriceDto(18m, "default"), await Price(ctx, capital.Id, tier: heavy.Id, from: rustavi.Id)); // weight tier, swapped zone

        ctx.CustomerSpecialPrices.Add(TestSupport.SpecialPrice(customer.Id, capital.Id, 4m));
        await ctx.SaveChangesAsync();
        Assert.Equal(new CalculatedPriceDto(4m, "special"), await Price(ctx, capital.Id, customer: customer.Id));
        Assert.Equal(new CalculatedPriceDto(15m, "special"), await Price(ctx, capital.Id, tier: heavy.Id, customer: customer.Id)); // weight overrides price, keeps tier label
    }
}
