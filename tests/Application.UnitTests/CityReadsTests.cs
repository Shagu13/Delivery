using Application.Cities.DTOs;
using Application.Cities.Queries.GetAllDistricts;
using Application.Cities.Queries.GetCities;
using Application.Cities.Queries.GetCityDeliverySchedule;
using Application.Cities.Queries.GetDistricts;
using Domain;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// The /api/cities reads moved out of <c>CitiesController</c>: active vs. soft-deleted lists,
/// the 404 (null) cases, and the calculator's district list joined to delivery schedules.
/// </summary>
public sealed class CityReadsTests
{
    private static async Task<(City Active, City Deleted, District Live, District Gone)> Seed(AppDbContext ctx)
    {
        City active  = new() { CityName = "Tbilisi" };
        City deleted = new() { CityName = "Oldtown", DateDeleted = CustomTime.Now };
        District live = new() { DistrictName = "Vake",  City = active };
        District gone = new() { DistrictName = "Saburtalo", City = active, DateDeleted = CustomTime.Now };
        District orphan = new() { DistrictName = "Ghost", City = deleted };   // live district in a deleted city
        ctx.AddRange(active, deleted, live, gone, orphan);
        await ctx.SaveChangesAsync();
        return (active, deleted, live, gone);
    }

    [Fact]
    public async Task Cities_split_into_active_and_deleted()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        var (active, deleted, _, _) = await Seed(ctx);
        var handler = new GetCitiesQueryHandler(ctx);

        Assert.Equal(active.Id,  Assert.Single(await handler.Handle(new GetCitiesQuery(), CancellationToken.None)).Id);
        Assert.Equal(deleted.Id, Assert.Single(await handler.Handle(new GetCitiesQuery(Deleted: true), CancellationToken.None)).Id);
    }

    [Fact]
    public async Task Districts_404_only_for_the_active_list_of_a_missing_or_deleted_city()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        var (active, deleted, live, gone) = await Seed(ctx);
        var handler = new GetDistrictsQueryHandler(ctx);

        Assert.Equal(live.Id, Assert.Single((await handler.Handle(new GetDistrictsQuery(active.Id), CancellationToken.None))!).Id);
        Assert.Equal(gone.Id, Assert.Single((await handler.Handle(new GetDistrictsQuery(active.Id, Deleted: true), CancellationToken.None))!).Id);
        Assert.Null(await handler.Handle(new GetDistrictsQuery(deleted.Id), CancellationToken.None));
        Assert.Null(await handler.Handle(new GetDistrictsQuery(Guid.NewGuid()), CancellationToken.None));
        Assert.Empty((await handler.Handle(new GetDistrictsQuery(Guid.NewGuid(), Deleted: true), CancellationToken.None))!);
    }

    [Fact]
    public async Task Delivery_schedule_is_not_set_until_configured_and_404s_for_a_deleted_city()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        var (active, deleted, _, _) = await Seed(ctx);
        var handler = new GetCityDeliveryScheduleQueryHandler(ctx);

        Assert.Equal(new DeliveryScheduleDto(false, false, false, false, false, false, false, false),
            await handler.Handle(new GetCityDeliveryScheduleQuery(active.Id), CancellationToken.None));
        Assert.Null(await handler.Handle(new GetCityDeliveryScheduleQuery(deleted.Id), CancellationToken.None));

        ctx.DeliverySchedules.Add(new DeliverySchedule { CityId = active.Id, Monday = true, Friday = true });
        await ctx.SaveChangesAsync();
        Assert.Equal(new DeliveryScheduleDto(true, true, false, false, false, true, false, false),
            await handler.Handle(new GetCityDeliveryScheduleQuery(active.Id), CancellationToken.None));
    }

    [Fact]
    public async Task All_districts_skips_deleted_rows_and_carries_the_city_schedule()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        var (active, _, live, _) = await Seed(ctx);
        var handler = new GetAllDistrictsQueryHandler(ctx);

        AllDistrictDto row = Assert.Single(await handler.Handle(new GetAllDistrictsQuery(), CancellationToken.None));
        Assert.Equal(live.Id, row.DistrictId);
        Assert.False(row.ScheduleSet);

        ctx.DeliverySchedules.Add(new DeliverySchedule { CityId = active.Id, Tuesday = true });
        await ctx.SaveChangesAsync();
        row = Assert.Single(await handler.Handle(new GetAllDistrictsQuery(), CancellationToken.None));
        Assert.True(row.ScheduleSet);
        Assert.True(row.Tuesday);
        Assert.False(row.Monday);
    }
}
