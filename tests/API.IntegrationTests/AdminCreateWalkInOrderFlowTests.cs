using Application;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.AdminCreateWalkInOrder;
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
/// Integration tests for the <c>AdminCreateWalkInOrderCommand</c> flow, driven through the
/// real MediatR pipeline and a real <see cref="AppDbContext"/> on the EF in-memory provider.
///
/// Covers the walk-in batch-folding rule added alongside <c>WalkInBatchResolver</c>: repeat
/// same-day walk-in submissions for the same customer/address fold into one open batch,
/// a new Georgian day always starts a fresh one, and a cancelled batch is never folded into.
/// </summary>
public class AdminCreateWalkInOrderFlowTests
{
    private static ServiceProvider BuildServices(string dbName)
    {
        ServiceCollection services = new();
        services.AddLogging();
        services.AddApplication();

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

    private static AdminCreateWalkInOrderCommand Command(Guid? existingCustomerId, params CreateOrderDto[] orders) =>
        new(new AdminCreateWalkInOrderDto(
            ExistingCustomerId: existingCustomerId,
            NewCustomer: existingCustomerId is null
                ? new WalkInCustomerDto(
                    FirstName:    "Ann",
                    LastName:     "Seller",
                    IdNumber:     "",
                    BusinessName: "Ann Shop",
                    PhoneNumber:  "555999888",
                    City:         "Testtown",
                    District:     "Central",
                    Address:      "Depot 1")
                : null,
            Orders: orders));

    private static CreateOrderDto Send(string district = "Central", string city = "Testtown") =>
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
    public async Task Same_day_walk_in_orders_for_the_same_customer_fold_into_one_batch()
    {
        string db = $"int-{Guid.NewGuid()}";
        await using ServiceProvider sp = BuildServices(db);

        using (IServiceScope seedScope = sp.CreateScope())
            Seed(seedScope.ServiceProvider.GetRequiredService<AppDbContext>());

        Guid customerId;
        using (IServiceScope s1 = sp.CreateScope())
        {
            var result = await s1.ServiceProvider.GetRequiredService<ISender>().Send(Command(null, Send()));
            using AppDbContext ctx1 = s1.ServiceProvider.GetRequiredService<AppDbContext>();
            customerId = ctx1.GroupOrders.AsNoTracking().Single().CustomerId!.Value;
        }

        using (IServiceScope s2 = sp.CreateScope())
            await s2.ServiceProvider.GetRequiredService<ISender>().Send(Command(customerId, Send()));

        using IServiceScope verify = sp.CreateScope();
        AppDbContext ctx = verify.ServiceProvider.GetRequiredService<AppDbContext>();

        GroupOrder groupOrder = Assert.Single(ctx.GroupOrders.AsNoTracking().ToList());
        Assert.Equal(2, groupOrder.NumberOfPackages);
        Assert.Equal(2, ctx.Orders.AsNoTracking().Count());
        Assert.All(ctx.Orders.AsNoTracking().ToList(),
            o => Assert.Equal(OrderStatus.AdminAcceptedOrderInWareHouse, o.Status));
    }

    [Fact]
    public async Task A_walk_in_batch_from_a_previous_day_does_not_receive_new_orders()
    {
        string db = $"int-{Guid.NewGuid()}";
        await using ServiceProvider sp = BuildServices(db);

        using (IServiceScope seedScope = sp.CreateScope())
            Seed(seedScope.ServiceProvider.GetRequiredService<AppDbContext>());

        Guid customerId;
        using (IServiceScope s1 = sp.CreateScope())
        {
            await s1.ServiceProvider.GetRequiredService<ISender>().Send(Command(null, Send()));
            using AppDbContext ctx1 = s1.ServiceProvider.GetRequiredService<AppDbContext>();
            GroupOrder yesterday = ctx1.GroupOrders.Single();
            customerId = yesterday.CustomerId!.Value;
            // Back-date the batch as if it were created yesterday — CustomTime.Today has no
            // test seam, so simulate "a new Georgian day" by rewriting the stored timestamp.
            yesterday.CreatedAt = CustomTime.Today.AddDays(-1);
            ctx1.SaveChanges();
        }

        using (IServiceScope s2 = sp.CreateScope())
            await s2.ServiceProvider.GetRequiredService<ISender>().Send(Command(customerId, Send()));

        using IServiceScope verify = sp.CreateScope();
        AppDbContext ctx = verify.ServiceProvider.GetRequiredService<AppDbContext>();

        Assert.Equal(2, ctx.GroupOrders.AsNoTracking().Count());
        Assert.All(ctx.GroupOrders.AsNoTracking().ToList(), g => Assert.Equal(1, g.NumberOfPackages));
    }

    [Fact]
    public async Task A_cancelled_walk_in_batch_does_not_receive_new_orders()
    {
        string db = $"int-{Guid.NewGuid()}";
        await using ServiceProvider sp = BuildServices(db);

        using (IServiceScope seedScope = sp.CreateScope())
            Seed(seedScope.ServiceProvider.GetRequiredService<AppDbContext>());

        Guid customerId;
        using (IServiceScope s1 = sp.CreateScope())
        {
            await s1.ServiceProvider.GetRequiredService<ISender>().Send(Command(null, Send()));
            using AppDbContext ctx1 = s1.ServiceProvider.GetRequiredService<AppDbContext>();
            GroupOrder cancelled = ctx1.GroupOrders.Single();
            customerId = cancelled.CustomerId!.Value;
            cancelled.Status = OrderStatus.CancelledByAdmin;
            ctx1.SaveChanges();
        }

        using (IServiceScope s2 = sp.CreateScope())
            await s2.ServiceProvider.GetRequiredService<ISender>().Send(Command(customerId, Send()));

        using IServiceScope verify = sp.CreateScope();
        AppDbContext ctx = verify.ServiceProvider.GetRequiredService<AppDbContext>();

        Assert.Equal(2, ctx.GroupOrders.AsNoTracking().Count());
    }
}
