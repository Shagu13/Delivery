using Application;
using Application.Common.Interfaces;
using Application.Common.Exceptions;
using Application.GroupOrders.Commands.CreateGroupOrder;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Persistence;

namespace API.IntegrationTests;

/// <summary>
/// Integration tests for the <c>CreateGroupOrderCommand</c> flow driven through the real
/// MediatR pipeline (Logging → Validation → Caching behaviors) and a real
/// <see cref="AppDbContext"/> on the EF in-memory provider. External-only services
/// (tracking sequence, admin SMS, distributed cache) are swapped for no-op test doubles.
///
/// This exercises validation + handler + <c>GroupOrderOrderBuilder</c> + persistence
/// together — the layers the unit tests cover in isolation, now wired end-to-end.
/// </summary>
public class CreateGroupOrderFlowTests
{
    private static ServiceProvider BuildServices(string dbName)
    {
        ServiceCollection services = new();
        services.AddLogging();
        services.AddApplication();                       // MediatR pipeline + FluentValidation validators

        services.AddDbContext<AppDbContext>(o => o
            .UseInMemoryDatabase(dbName)
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.AddScoped<ITrackingNumberGenerator, FakeTrackingNumberGenerator>();
        services.AddScoped<IAdminNotificationSmsService, NoopAdminSms>();
        services.AddScoped<ICacheService, NoopCache>();

        return services.BuildServiceProvider();
    }

    private static void Seed(AppDbContext ctx)
    {
        City city = new() { CityName = "Testtown" };
        District district = new()
        {
            DistrictName        = "Central",
            CompanyServicePrice = 5m,
            IsCityTerritory     = true,
            City                = city,
            CityId              = city.Id,
        };
        ctx.Cities.Add(city);
        ctx.Districts.Add(district);
        ctx.SaveChanges();
    }

    private static CreateGroupOrderCommand Command(Guid? customerId, params CreateOrderDto[] orders) =>
        new(new CreateGroupOrderDto(
            SenderFirstName:        "Ann",
            SenderLastName:         "Seller",
            SenderIdNumber:         null,
            SenderBusinessName:     "Ann Shop",
            SenderPhone:            "555999888",
            AlternativeSenderPhone: null,
            PickUpCity:             "Testtown",
            PickUpDistrict:         "Central",
            PickUpAddress:          "Depot 1",
            Note:                   null,
            Orders:                 orders,
            CustomerId:             customerId));

    private static CreateOrderDto Send(string district, string city = "Testtown") =>
        new(
            RecipientName:            "Recipient",
            RecipientPhone:           "555111222",
            RecipientCity:            city,
            RecipientDistrict:        district,
            RecipientAddress:         "Some street 1",
            Description:              null,
            IsFragile:                false,
            ProductPaymentStatus:     PaymentStatus.Paid,
            WhoPaysForCompanyService: ServicePayer.Sender);

    [Fact]
    public async Task Valid_order_is_persisted_with_a_group_order_and_tracking_number()
    {
        string db = $"int-{Guid.NewGuid()}";
        await using ServiceProvider sp = BuildServices(db);

        using (IServiceScope seedScope = sp.CreateScope())
            Seed(seedScope.ServiceProvider.GetRequiredService<AppDbContext>());

        CreateGroupOrderResultDto result;
        using (IServiceScope scope = sp.CreateScope())
        {
            ISender sender = scope.ServiceProvider.GetRequiredService<ISender>();
            result = await sender.Send(Command(Guid.NewGuid(), Send("Central")));
        }

        Assert.NotEqual(Guid.Empty, result.GroupOrderId);
        CreatedOrderDto created = Assert.Single(result.Orders);
        Assert.StartsWith("TN-", created.TrackingNumber);

        // Assert it actually hit the database, priced off the district default (5).
        using IServiceScope verify = sp.CreateScope();
        AppDbContext ctx = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        Order persisted = Assert.Single(ctx.Orders.AsNoTracking().ToList());
        Assert.Equal(5m, persisted.CompanyServicePrice);
        Assert.Equal(1, ctx.GroupOrders.AsNoTracking().Count());
    }

    [Fact]
    public async Task Same_day_same_pickup_orders_fold_into_one_open_batch()
    {
        string db = $"int-{Guid.NewGuid()}";
        await using ServiceProvider sp = BuildServices(db);

        using (IServiceScope seedScope = sp.CreateScope())
            Seed(seedScope.ServiceProvider.GetRequiredService<AppDbContext>());

        Guid customerId = Guid.NewGuid();

        using (IServiceScope s1 = sp.CreateScope())
            await s1.ServiceProvider.GetRequiredService<ISender>().Send(Command(customerId, Send("Central")));
        using (IServiceScope s2 = sp.CreateScope())
            await s2.ServiceProvider.GetRequiredService<ISender>().Send(Command(customerId, Send("Central")));

        using IServiceScope verify = sp.CreateScope();
        AppDbContext ctx = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, ctx.GroupOrders.AsNoTracking().Count());       // one open batch
        Assert.Equal(2, ctx.Orders.AsNoTracking().Count());           // both packages
    }

    [Fact]
    public async Task Unknown_recipient_city_is_rejected_by_the_validation_pipeline()
    {
        string db = $"int-{Guid.NewGuid()}";
        await using ServiceProvider sp = BuildServices(db);

        using (IServiceScope seedScope = sp.CreateScope())
            Seed(seedScope.ServiceProvider.GetRequiredService<AppDbContext>());

        using IServiceScope scope = sp.CreateScope();
        ISender sender = scope.ServiceProvider.GetRequiredService<ISender>();

        await Assert.ThrowsAsync<ValidationException>(() =>
            sender.Send(Command(Guid.NewGuid(), Send("Central", city: "Nowhere"))));
    }
}
