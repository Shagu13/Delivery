using Application.Common.Interfaces;
using Application.Orders.Commands;
using Domain;
using Domain.Enums;
using Persistence;
using CourierEntity = Domain.Courier;

namespace Application.UnitTests;

/// <summary>
/// A courier's salary is auto-filled per recipient zone (Capital / City / District, from the
/// district's IsCapitalTerritory / IsCityTerritory flags). A zone with no price — or an unknown
/// district — leaves the salary empty for the admin; there is no fallback between zones.
/// </summary>
public sealed class CourierZoneSalaryTests
{
    private sealed class NoopNotifier : IOrderAssignmentNotifier
    {
        public void NotifyCourierAssigned(Guid courierId, string recipientPhone, string trackingNumber,
            string? senderBusinessName, string recipientCity, string recipientDistrict) { }
        public void NotifyCourierAssignedPickup(Guid courierId, string? senderBusinessName, string pickUpCity, string pickUpDistrict) { }
        public void NotifyCourierAssignedBulk(Guid courierId, IReadOnlyList<AssignedDeliveryNotice> deliveries) { }
        public void NotifyCourierAssignedPickupBulk(Guid courierId, IReadOnlyList<AssignedPickupNotice> pickups) { }
    }

    private sealed class NoopRealtime : IRealtimeNotifier
    {
        public void NotifyAdminsOrdersChanged() { }
        public void NotifyCourierOrdersChanged(Guid courierId) { }
    }

    private static void SeedZones(AppDbContext ctx)
    {
        City tbilisi = new() { CityName = "Tbilisi" };
        City kutaisi = new() { CityName = "Kutaisi" };
        ctx.Cities.AddRange(tbilisi, kutaisi);
        ctx.Districts.AddRange(
            new District { DistrictName = "Vake",    CityId = tbilisi.Id, IsCapitalTerritory = true },
            new District { DistrictName = "Center",  CityId = kutaisi.Id, IsCityTerritory = true },
            new District { DistrictName = "Village", CityId = kutaisi.Id },
            // Same name in two cities — must resolve by (city, name).
            new District { DistrictName = "Central", CityId = tbilisi.Id, IsCapitalTerritory = true },
            new District { DistrictName = "Central", CityId = kutaisi.Id });
    }

    private static Order AddParcel(AppDbContext ctx, string city, string district, decimal fee = 10m)
    {
        Order order = new()
        {
            TrackingNumber      = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName       = "Recipient",
            RecipientPhone      = "555111222",
            RecipientCity       = city,
            RecipientDistrict   = district,
            RecipientAddress    = "Some street 1",
            OrderType           = OrderType.Send,
            Status              = OrderStatus.AdminAcceptedOrderInWareHouse,
            CompanyServicePrice = fee,
            CreatedAt           = CustomTime.Now,
        };
        ctx.Orders.Add(order);
        return order;
    }

    private static CourierEntity ZonedCourier(AppDbContext ctx, decimal? capital, decimal? city, decimal? district)
    {
        CourierEntity courier = Fixtures.AddCourier(ctx, "user-1");
        courier.CapitalSalary  = capital;
        courier.CitySalary     = city;
        courier.DistrictSalary = district;
        return courier;
    }

    [Fact]
    public async Task Bulk_assign_picks_the_salary_for_each_orders_zone()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        SeedZones(ctx);
        CourierEntity courier = ZonedCourier(ctx, capital: 5m, city: 7m, district: 9m);
        Order toCapital  = AddParcel(ctx, "Tbilisi", "Vake");
        Order toCity     = AddParcel(ctx, "Kutaisi", "Center");
        Order toVillage  = AddParcel(ctx, "Kutaisi", "Village");
        Order tbCentral  = AddParcel(ctx, "Tbilisi", "Central");
        Order kuCentral  = AddParcel(ctx, "Kutaisi", "Central");
        await ctx.SaveChangesAsync();

        BulkAssignCourierToOrdersCommandHandler handler = new(ctx, new NoopNotifier());
        await handler.Handle(new BulkAssignCourierToOrdersCommand(
            new[] { toCapital.Id, toCity.Id, toVillage.Id, tbCentral.Id, kuCentral.Id }, courier.Id),
            CancellationToken.None);

        Assert.Equal(5m, toCapital.CourierSalary);
        Assert.Equal(7m, toCity.CourierSalary);
        Assert.Equal(9m, toVillage.CourierSalary);
        Assert.Equal(5m, tbCentral.CourierSalary);
        Assert.Equal(9m, kuCentral.CourierSalary);
        Assert.Equal(5m, toCapital.CompanyRevenue); // fee 10 − salary 5
    }

    [Fact]
    public async Task Zone_without_a_price_leaves_salary_empty_no_fallback()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        SeedZones(ctx);
        CourierEntity courier = ZonedCourier(ctx, capital: null, city: null, district: 9m);
        Order toCapital = AddParcel(ctx, "Tbilisi", "Vake");
        Order unknown   = AddParcel(ctx, "Tbilisi", "Nowhere");
        await ctx.SaveChangesAsync();

        BulkAssignCourierToOrdersCommandHandler handler = new(ctx, new NoopNotifier());
        await handler.Handle(new BulkAssignCourierToOrdersCommand(
            new[] { toCapital.Id, unknown.Id }, courier.Id), CancellationToken.None);

        Assert.Null(toCapital.CourierSalary);
        Assert.Null(unknown.CourierSalary);
    }

    [Fact]
    public async Task Single_assign_applies_the_zone_salary()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        SeedZones(ctx);
        CourierEntity courier = ZonedCourier(ctx, capital: 5m, city: 7m, district: 9m);
        Order parcel = AddParcel(ctx, "Kutaisi", "Center");
        await ctx.SaveChangesAsync();

        AssignCourierToOrderCommandHandler handler = new(ctx, new NoopRealtime(), new NoopNotifier());
        await handler.Handle(new AssignCourierToOrderCommand(parcel.Id, courier.Id), CancellationToken.None);

        Assert.Equal(7m, parcel.CourierSalary);
    }

    [Fact]
    public async Task Admin_mark_delivered_fills_a_missing_salary_from_the_zone()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        SeedZones(ctx);
        CourierEntity courier = ZonedCourier(ctx, capital: 5m, city: 7m, district: 9m);
        Order parcel = AddParcel(ctx, "Kutaisi", "Village");
        parcel.CourierId = courier.Id;
        parcel.Status = OrderStatus.CourierAssignedToDeliver;
        await ctx.SaveChangesAsync();

        AdminMarkOrderDeliveredCommandHandler handler = new(ctx);
        await handler.Handle(new AdminMarkOrderDeliveredCommand(parcel.Id), CancellationToken.None);

        Assert.Equal(9m, parcel.CourierSalary);
    }
}
