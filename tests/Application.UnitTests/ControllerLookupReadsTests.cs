using Application.GroupOrders.Queries.ExcelLookups;
using Application.PartnerOrders.Queries.GetPartnerIntakeContext;
using Domain;
using Domain.Enums;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// The lookup reads moved out of <c>GroupOrdersController</c> (Excel template / import) and
/// <c>PartnerOrdersController</c> (partner intake): ordering, soft-delete filtering, Georgian → English
/// name maps, and the partner intake's staged checks (unknown partner → duplicates → location maps).
/// </summary>
public sealed class ControllerLookupReadsTests
{
    private static async Task SeedPlaces(AppDbContext ctx)
    {
        City tbilisi = new() { CityName = "Tbilisi", CityNameGeo = "თბილისი" };
        City batumi  = new() { CityName = "Batumi",  CityNameGeo = "ბათუმი" };
        City gone    = new() { CityName = "Oldtown", CityNameGeo = "ძველი", DateDeleted = CustomTime.Now };
        ctx.AddRange(tbilisi, batumi, gone,
            new District { DistrictName = "Vake",      DistrictNameGeo = "ვაკე",      City = tbilisi, IsCapitalTerritory = true },
            new District { DistrictName = "Saburtalo", DistrictNameGeo = "საბურთალო", City = tbilisi, IsCapitalTerritory = true },
            new District { DistrictName = "Old",       DistrictNameGeo = "ძველი-უბ",  City = tbilisi, DateDeleted = CustomTime.Now },
            new District { DistrictName = "Center",    City = batumi },                                  // no Georgian name
            TestSupport.Tier(capital: 5, min: 5, max: 10),
            TestSupport.Tier(capital: 3, min: 0, max: 5),
            TestSupport.Tier(capital: 9, min: 10, max: 20, deleted: CustomTime.Now));
        await ctx.SaveChangesAsync();
    }

    [Fact]
    public async Task Template_lookups_are_ordered_and_skip_deleted_rows()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        await SeedPlaces(ctx);

        ExcelTemplateLookupsDto result = await new GetExcelTemplateLookupsQueryHandler(ctx)
            .Handle(new GetExcelTemplateLookupsQuery(), CancellationToken.None);

        Assert.Equal(new[] { "Batumi", "Tbilisi" }, result.Cities.Select(c => c.CityName));
        Assert.Equal(new[] { "Saburtalo", "Vake" }, result.Cities[1].Districts.Select(d => d.DistrictName));
        Assert.All(result.Cities[1].Districts, d => Assert.True(d.IsCapitalTerritory));
        Assert.Equal(new[] { 0m, 5m }, result.Tiers.Select(t => t.MinWeightKg));
    }

    [Fact]
    public async Task Import_lookups_map_georgian_names_to_english_for_active_rows_only()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        await SeedPlaces(ctx);

        ExcelImportLookupsDto result = await new GetExcelImportLookupsQueryHandler(ctx)
            .Handle(new GetExcelImportLookupsQuery(), CancellationToken.None);

        Assert.Equal("Tbilisi", result.CityGeoToEn["თბილისი"]);
        Assert.False(result.CityGeoToEn.ContainsKey("ძველი"));          // deleted city
        Assert.Equal("Vake", result.DistrictGeoToEn["ვაკე"]);
        Assert.False(result.DistrictGeoToEn.ContainsKey("ძველი-უბ"));    // deleted district
        Assert.Equal(2, result.Tiers.Count);
    }

    // ── Partner intake ───────────────────────────────────────────────────────────

    private static Task<PartnerIntakeContextDto> Intake(AppDbContext ctx, Guid customerId, params string[] refs) =>
        new GetPartnerIntakeContextQueryHandler(ctx)
            .Handle(new GetPartnerIntakeContextQuery(customerId, refs), CancellationToken.None);

    [Fact]
    public async Task Partner_intake_unknown_partner_stops_before_any_other_read()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        await SeedPlaces(ctx);

        PartnerIntakeContextDto result = await Intake(ctx, Guid.NewGuid(), "REF-1");

        Assert.Null(result.Customer);
        Assert.Empty(result.DuplicateReferences);
        Assert.Null(result.Locations);
    }

    [Fact]
    public async Task Partner_intake_reports_duplicates_through_either_ownership_path_and_skips_maps()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        await SeedPlaces(ctx);
        Customer partner = TestSupport.Cust();
        Customer other   = TestSupport.Cust();
        other.ApplicationUserId = "user-2";
        GroupOrder batch = new()
        {
            Customer = partner, SenderFirstName = "A", SenderLastName = "B",
            SenderBusinessName = "Biz", SenderPhone = "555000000",
            PickUpCity = "Tbilisi", PickUpDistrict = "Vake", PickUpAddress = "Addr",
        };
        ctx.AddRange(partner, other, batch,
            NewOrder("REF-BATCH", o => o.GroupOrder = batch),                  // via the batch
            NewOrder("REF-RETURN", o => { o.Customer = partner; o.OrderType = OrderType.Return; }), // direct
            NewOrder("REF-OTHER", o => o.Customer = other));                    // another partner's
        await ctx.SaveChangesAsync();

        PartnerIntakeContextDto result = await Intake(ctx, partner.Id, "REF-BATCH", "REF-RETURN", "REF-OTHER", "REF-NEW");

        Assert.Equal("Biz", result.Customer!.BusinessName);
        Assert.Equal(new[] { "REF-BATCH", "REF-RETURN" }, result.DuplicateReferences.Order());
        Assert.Null(result.Locations);
    }

    [Fact]
    public async Task Partner_intake_with_no_duplicates_returns_location_maps()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        await SeedPlaces(ctx);
        Customer partner = TestSupport.Cust();
        ctx.Add(partner);
        await ctx.SaveChangesAsync();

        PartnerIntakeContextDto result = await Intake(ctx, partner.Id, "REF-NEW");

        Assert.Empty(result.DuplicateReferences);
        PartnerLocationMapsDto maps = result.Locations!;
        Assert.Equal("Batumi", maps.CityGeoToEn["ბათუმი"]);
        Assert.Equal("Saburtalo", maps.DistrictGeoToEn["საბურთალო"]);
        Assert.Equal("Saburtalo", maps.CapitalDistrictByCity["tbilisi"]);   // first capital district, case-insensitive key
        Assert.False(maps.CapitalDistrictByCity.ContainsKey("Batumi"));
    }

    private static Order NewOrder(string externalRef, Action<Order> configure)
    {
        Order order = new()
        {
            TrackingNumber    = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName     = "Recipient",
            RecipientPhone    = "555111222",
            RecipientCity     = "Tbilisi",
            RecipientDistrict = "Vake",
            RecipientAddress  = "Some street 1",
            ExternalReference = externalRef,
        };
        configure(order);
        return order;
    }
}
