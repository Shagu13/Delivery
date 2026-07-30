using Application.Common.Exceptions;
using Domain;
using Domain.Enums;
using Persistence;
using static Application.UnitTests.TestSupport;

namespace Application.UnitTests;

/// <summary>
/// Pricing-waterfall tests for <c>GroupOrderOrderBuilder</c>:
///   explicit override → weight-tier zone price → customer-negotiated → district default,
/// plus the non-capital-pickup-into-the-capital "swap" and the weight-tier "prime over
/// customer price" rule.
///
/// Districts used throughout:
///   • "TbilisiCenter" — capital  (default 6)
///   • "RustaviCenter" — city     (default 5)
///   • "Village"       — plain    (default 4)
/// </summary>
public class GroupOrderOrderBuilderTests
{
    private static void SeedDistricts(AppDbContext ctx)
    {
        ctx.Districts.AddRange(
            Dist("TbilisiCenter", 6m, capital: true),
            Dist("RustaviCenter", 5m, city: true),
            Dist("Village",       4m));
        ctx.SaveChanges();
    }

    // ── Standard pricing (no tier, no customer) ────────────────────────────────

    [Fact]
    public async Task District_default_is_used_when_no_tier_and_no_customer()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);

        List<Order> built = await Build(ctx, customer: null, Order("TbilisiCenter"));

        Assert.Equal(6m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Customer_negotiated_price_beats_district_default()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        Customer customer = Cust(capital: 10m);

        List<Order> built = await Build(ctx, customer, Order("TbilisiCenter"));

        Assert.Equal(10m, built[0].CompanyServicePrice);
    }

    // ── Explicit override wins over everything ─────────────────────────────────

    [Fact]
    public async Task Explicit_price_override_wins_over_tier_and_customer()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        WeightPriceTier tier = Tier(capital: 7m);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();
        Customer customer = Cust(capital: 10m);

        List<Order> built = await Build(ctx, customer, Order("TbilisiCenter", tier: tier.Id, explicitPrice: 99m));

        Assert.Equal(99m, built[0].CompanyServicePrice);
    }

    // ── Weight tier is prime over the customer's negotiated price ───────────────

    [Fact]
    public async Task Tier_zone_price_beats_customer_negotiated_price()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        WeightPriceTier tier = Tier(capital: 7m);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();
        Customer customer = Cust(capital: 10m);

        List<Order> built = await Build(ctx, customer, Order("TbilisiCenter", tier: tier.Id));

        Assert.Equal(7m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Null_tier_zone_falls_back_to_customer_negotiated_price()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        // Capital price left null on the tier → fall through for capital recipients.
        WeightPriceTier tier = Tier(capital: null, city: 8m);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();
        Customer customer = Cust(capital: 10m);

        List<Order> built = await Build(ctx, customer, Order("TbilisiCenter", tier: tier.Id));

        Assert.Equal(10m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Null_tier_zone_and_no_customer_falls_back_to_district_default()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        WeightPriceTier tier = Tier(capital: null, city: 8m);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();

        List<Order> built = await Build(ctx, customer: null, Order("TbilisiCenter", tier: tier.Id));

        Assert.Equal(6m, built[0].CompanyServicePrice);
    }

    // ── Non-capital pickup → capital delivery "swap": prices off the pickup zone ───

    [Fact]
    public async Task Non_capital_pickup_prices_tier_off_the_pickup_zone()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        // City=8, District=3 set; Capital left null (mirrors the owner's real config).
        WeightPriceTier tier = Tier(capital: null, city: 8m, district: 3m);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();

        // Recipient is the capital, but pickup is a city → swap to the pickup (city) zone.
        List<Order> built = await Build(
            ctx, customer: null, Order("TbilisiCenter", tier: tier.Id), pickupDistrict: "RustaviCenter");

        Assert.Equal(8m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Chosen_tier_beats_the_customer_rate_on_a_swapped_order()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        WeightPriceTier tier = Tier(capital: null, city: 8m);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();
        // Customer HAS a negotiated capital rate, but a chosen tier is prime — and the tier's
        // zone follows the swap, so the pickup (city) tier price wins.
        Customer customer = Cust(capital: 10m);

        List<Order> built = await Build(
            ctx, customer, Order("TbilisiCenter", tier: tier.Id), pickupDistrict: "RustaviCenter");

        Assert.Equal(8m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Without_a_tier_the_customers_delivery_zone_rate_holds_over_the_swap()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        Customer customer = Cust(capital: 10m);

        // No tier: the customer's negotiated capital rate holds on the recipient's capital
        // zone rather than swapping to the city pickup's default.
        List<Order> built = await Build(
            ctx, customer, Order("TbilisiCenter"), pickupDistrict: "RustaviCenter");

        Assert.Equal(10m, built[0].CompanyServicePrice);
    }

    // ── No swap between two non-capital locations ───────────────────────────────
    // A non-capital pickup only swaps when the delivery IS the capital. Otherwise the
    // delivery district's own zone and default price apply, exactly as for a capital pickup.

    [Fact]
    public async Task City_pickup_to_a_plain_district_uses_the_delivery_districts_default()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);

        List<Order> built = await Build(
            ctx, customer: null, Order("Village"), pickupDistrict: "RustaviCenter");

        // Village's own default (4), not the Rustavi pickup's (5).
        Assert.Equal(4m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Plain_district_pickup_to_a_city_uses_the_delivery_citys_default()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);

        List<Order> built = await Build(
            ctx, customer: null, Order("RustaviCenter"), pickupDistrict: "Village");

        // RustaviCenter's own default (5), not the Village pickup's (4).
        Assert.Equal(5m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Non_capital_to_non_capital_prices_the_tier_off_the_delivery_zone()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        WeightPriceTier tier = Tier(capital: null, city: 8m, district: 3m);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();

        // City pickup, plain-district delivery → the tier's district price, not its city price.
        List<Order> built = await Build(
            ctx, customer: null, Order("Village", tier: tier.Id), pickupDistrict: "RustaviCenter");

        Assert.Equal(3m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Non_capital_to_non_capital_falls_back_to_the_delivery_default_not_the_pickups()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        // No district price on the tier → nothing resolves for the delivery (plain) zone.
        WeightPriceTier tier = Tier(capital: null, city: 8m, district: null);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();

        List<Order> built = await Build(
            ctx, customer: null, Order("Village", tier: tier.Id), pickupDistrict: "RustaviCenter");

        Assert.Equal(4m, built[0].CompanyServicePrice);
    }

    // ── Customer rates always follow the delivery zone ─────────────────────────
    // A customer's rate is read off the DELIVERY location (capital/city/district) whatever
    // the pickup is — even when the default price swaps to a non-capital pickup.

    [Fact]
    public async Task Swap_does_not_price_a_capital_delivery_off_the_customers_city_rate()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        // All three rates negotiated; delivery is the capital, pickup a city.
        Customer customer = Cust(capital: 10m, city: 7m, district: 5m);

        List<Order> built = await Build(
            ctx, customer, Order("TbilisiCenter"), pickupDistrict: "RustaviCenter");

        // The capital rate — not the city rate the city pickup used to force.
        Assert.Equal(10m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task City_pickup_prices_a_plain_district_delivery_off_the_customers_district_rate()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        Customer customer = Cust(capital: 10m, city: 7m, district: 5m);

        List<Order> built = await Build(
            ctx, customer, Order("Village"), pickupDistrict: "RustaviCenter");

        Assert.Equal(5m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Plain_district_pickup_prices_a_city_delivery_off_the_customers_city_rate()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        Customer customer = Cust(capital: 10m, city: 7m, district: 5m);

        List<Order> built = await Build(
            ctx, customer, Order("RustaviCenter"), pickupDistrict: "Village");

        Assert.Equal(7m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Swap_applies_when_the_customer_has_no_negotiated_rates()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        Customer customer = Cust();   // no negotiated rates at all

        // Nothing of the customer's to apply → the pickup (city, default 5) price stands.
        List<Order> built = await Build(
            ctx, customer, Order("TbilisiCenter"), pickupDistrict: "RustaviCenter");

        Assert.Equal(5m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Swapped_tier_zone_price_still_beats_the_customers_delivery_zone_rate()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        WeightPriceTier tier = Tier(capital: null, city: 8m);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();
        Customer customer = Cust(capital: 10m, city: 7m);

        // Tier stays prime and keeps pricing off the (city) pickup zone.
        List<Order> built = await Build(
            ctx, customer, Order("TbilisiCenter", tier: tier.Id), pickupDistrict: "RustaviCenter");

        Assert.Equal(8m, built[0].CompanyServicePrice);
    }

    [Fact]
    public async Task Swapped_tier_with_no_zone_price_falls_back_to_the_delivery_zone_rate()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        // No city price on the tier → the swapped (city) pickup zone resolves nothing.
        WeightPriceTier tier = Tier(capital: 7m, city: null);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();
        Customer customer = Cust(capital: 10m, city: 3m);

        List<Order> built = await Build(
            ctx, customer, Order("TbilisiCenter", tier: tier.Id), pickupDistrict: "RustaviCenter");

        // Falls through to the customer's rate for the DELIVERY zone (capital), not city.
        Assert.Equal(10m, built[0].CompanyServicePrice);
    }

    // ── Returns price off their own pickup district (never swapped) ────────────

    [Fact]
    public async Task Return_order_prices_off_its_own_pickup_district()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);

        List<Order> built = await Build(
            ctx, customer: null,
            Order("TbilisiCenter", type: OrderType.Return, returnDistrict: "RustaviCenter"),
            pickupDistrict: "Village");

        // Return collects at RustaviCenter (city, default 5); the batch pickup is irrelevant.
        Assert.Equal(5m, built[0].CompanyServicePrice);
    }

    // ── Bookkeeping / edge cases ───────────────────────────────────────────────

    [Fact]
    public async Task Selected_tier_id_is_stored_on_the_order()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        WeightPriceTier tier = Tier(capital: 7m);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();

        List<Order> built = await Build(ctx, customer: null, Order("TbilisiCenter", tier: tier.Id));

        Assert.Equal(tier.Id, built[0].WeightPriceTierId);
    }

    [Fact]
    public async Task Soft_deleted_tier_is_ignored_and_falls_back_to_standard_pricing()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);
        WeightPriceTier tier = Tier(capital: 7m, deleted: DateTime.UtcNow);
        ctx.WeightPriceTiers.Add(tier);
        ctx.SaveChanges();

        List<Order> built = await Build(ctx, customer: null, Order("TbilisiCenter", tier: tier.Id));

        Assert.Equal(6m, built[0].CompanyServicePrice);   // district default, tier ignored
    }

    [Fact]
    public async Task Unknown_district_leaves_the_price_at_zero()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);

        List<Order> built = await Build(ctx, customer: null, Order("NoSuchDistrict"));

        Assert.Equal(0m, built[0].CompanyServicePrice);
    }

    // ── "Service fee included" (all-in) handling ───────────────────────────────

    [Fact]
    public async Task All_in_price_deducts_the_resolved_fee_into_the_product_amount()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);

        List<Order> built = await Build(
            ctx, customer: null,
            Order("TbilisiCenter", payment: PaymentStatus.NotPaid, amount: 100m, allIn: true));

        Assert.Equal(6m, built[0].CompanyServicePrice);              // resolved fee
        Assert.Equal(94m, built[0].AmountToCollectForPackage);       // 100 all-in − 6 fee
        Assert.True(built[0].IsCompanyServicePriceIncluded);
    }

    [Fact]
    public async Task All_in_price_below_the_fee_is_rejected()
    {
        using AppDbContext ctx = NewContext();
        SeedDistricts(ctx);

        await Assert.ThrowsAsync<ValidationException>(() => Build(
            ctx, customer: null,
            Order("TbilisiCenter", payment: PaymentStatus.NotPaid, amount: 3m, allIn: true)));
    }
}
