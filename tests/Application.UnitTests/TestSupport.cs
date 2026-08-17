using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// Shared fixtures for the pricing tests: an in-memory <see cref="AppDbContext"/>,
/// a deterministic tracking-number generator, and small factory helpers so each
/// test reads as "given these districts / tier / customer, price this order".
/// </summary>
internal static class TestSupport
{
    public static AppDbContext NewContext()
    {
        DbContextOptions<AppDbContext> options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"delivery-tests-{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new AppDbContext(options);
    }

    public static District Dist(string name, decimal? price, bool capital = false, bool city = false) =>
        new()
        {
            DistrictName        = name,
            CompanyServicePrice = price,
            IsCapitalTerritory  = capital,
            IsCityTerritory     = city,
            CityId              = Guid.NewGuid(),
        };

    public static WeightPriceTier Tier(
        decimal? capital = null, decimal? city = null, decimal? district = null,
        decimal min = 0, decimal max = 5, DateTime? deleted = null) =>
        new()
        {
            MinWeightKg   = min,
            MaxWeightKg   = max,
            CapitalPrice  = capital,
            CityPrice     = city,
            DistrictPrice = district,
            DateDeleted   = deleted,
        };

    public static Customer Cust(
        decimal? capital = null, decimal? city = null, decimal? district = null, bool allIn = false) =>
        new()
        {
            FirstName    = "Test",
            LastName     = "Customer",
            BusinessName = "Biz",
            PhoneNumber  = "555000000",
            City         = "City",
            District     = "District",
            Address      = "Addr",
            ApplicationUserId          = "user-1",
            CompanyServiceCapitalPrice  = capital,
            CompanyServiceCityPrice     = city,
            CompanyServiceDistrictPrice = district,
            IsCompanyServicePriceIncludedInPrice = allIn,
        };

    public static CustomerSpecialPrice SpecialPrice(Guid customerId, Guid districtId, decimal price) =>
        new() { CustomerId = customerId, DistrictId = districtId, Price = price };

    public static CreateOrderDto Order(
        string district,
        Guid? tier = null,
        decimal? explicitPrice = null,
        OrderType type = OrderType.Send,
        string? returnDistrict = null,
        PaymentStatus payment = PaymentStatus.Paid,
        decimal? amount = null,
        bool allIn = false) =>
        new(
            RecipientName:             "Recipient",
            RecipientPhone:            "555111222",
            RecipientCity:             "City",
            RecipientDistrict:         district,
            RecipientAddress:          "Some street 1",
            Description:               null,
            IsFragile:                 false,
            ProductPaymentStatus:      payment,
            WhoPaysForCompanyService:  ServicePayer.Sender,
            OrderType:                 type,
            ReturnPickupAddress:       type == OrderType.Return ? "Return st 2" : null,
            ReturnPickupCity:          type == OrderType.Return ? "City"         : null,
            ReturnPickupDistrict:      returnDistrict,
            AmountToCollectForPackage: amount,
            CompanyServicePrice:       explicitPrice,
            WeightPriceTierId:         tier,
            IsCompanyServicePriceIncluded: allIn);

    public static Task<List<Order>> Build(
        AppDbContext ctx, Customer? customer, CreateOrderDto dto, string? pickupDistrict = null) =>
        Application.GroupOrders.Commands.Shared.GroupOrderOrderBuilder.BuildAsync(
            ctx, new FakeTrackingNumberGenerator(), customer, new[] { dto }, CancellationToken.None, pickupDistrict);
}

/// <summary>Deterministic, no-DB tracking-number generator for tests.</summary>
internal sealed class FakeTrackingNumberGenerator : ITrackingNumberGenerator
{
    private int _n;

    public Task<string> GenerateAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult($"TN-{++_n:D8}");

    public Task<IReadOnlyList<string>> GenerateManyAsync(int count, CancellationToken cancellationToken = default)
    {
        List<string> nums = new(count);
        for (int i = 0; i < count; i++) nums.Add($"TN-{++_n:D8}");
        return Task.FromResult<IReadOnlyList<string>>(nums);
    }
}
