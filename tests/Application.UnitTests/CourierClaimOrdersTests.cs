using Application.Common.Interfaces;
using Application.Orders.Commands;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Persistence;
using CourierEntity = Domain.Courier;

namespace Application.UnitTests;

/// <summary>
/// A courier scanning warehouse parcels to claim them for themselves: only genuinely unassigned
/// Send/Exchange parcels are taken, and a parcel another courier holds is never grabbed.
/// </summary>
public sealed class CourierClaimOrdersTests
{
    private static async Task<BulkAssignCourierResultDto> Claim(
        AppDbContext ctx, string courierUserId, params Guid[] orderIds)
    {
        ServiceCollection services = new();
        services.AddSingleton<IAppDbContext>(ctx);
        services.AddSingleton<IOrderAssignmentNotifier>(new NoopAssignmentNotifier());
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(CourierClaimOrdersCommand).Assembly));

        await using ServiceProvider provider = services.BuildServiceProvider();
        return await provider.GetRequiredService<ISender>()
            .Send(new CourierClaimOrdersCommand(orderIds, courierUserId));
    }

    private static Order AddSend(AppDbContext ctx, OrderStatus status, Guid? courierId = null, OrderType type = OrderType.Send)
    {
        Order order = new()
        {
            TrackingNumber    = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName     = "Recipient",
            RecipientPhone    = "555111222",
            RecipientCity     = "Tbilisi",
            RecipientDistrict = "District",
            RecipientAddress  = "Some street 1",
            OrderType         = type,
            Status            = status,
            CourierId         = courierId,
            CreatedAt         = CustomTime.Now,
        };
        ctx.Orders.Add(order);
        return order;
    }

    [Theory]
    [InlineData(OrderStatus.AdminAcceptedOrderInWareHouse)]
    [InlineData(OrderStatus.OrderIsOnItsWayToRecipientsCity)]
    public async Task Unassigned_parcel_is_assigned_to_the_claiming_courier(OrderStatus status)
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity me = Fixtures.AddCourier(ctx, "user-me");
        Order parcel = AddSend(ctx, status);
        await ctx.SaveChangesAsync();

        BulkAssignCourierResultDto result = await Claim(ctx, "user-me", parcel.Id);

        Assert.Equal(new[] { parcel.Id }, result.Succeeded);
        Assert.Empty(result.Failed);
        Assert.Equal(me.Id, parcel.CourierId);
        Assert.Equal(OrderStatus.CourierAssignedToDeliver, parcel.Status);
    }

    [Fact]
    public async Task Parcel_held_by_another_courier_is_not_taken()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Fixtures.AddCourier(ctx, "user-me");
        CourierEntity other = Fixtures.AddCourier(ctx, "user-other");
        Order parcel = AddSend(ctx, OrderStatus.CourierAssignedToDeliver, other.Id);
        await ctx.SaveChangesAsync();

        BulkAssignCourierResultDto result = await Claim(ctx, "user-me", parcel.Id);

        Assert.Empty(result.Succeeded);
        Assert.Single(result.Failed);
        Assert.Equal(other.Id, parcel.CourierId);
    }

    [Theory]
    [InlineData(OrderStatus.DeliveredToWarehouse)]   // batch arrived but admin has not accepted it
    [InlineData(OrderStatus.DeliveredToRecipient)]
    [InlineData(OrderStatus.CancelledByAdmin)]
    public async Task Parcel_not_waiting_for_a_courier_is_rejected(OrderStatus status)
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Fixtures.AddCourier(ctx, "user-me");
        Order parcel = AddSend(ctx, status);
        await ctx.SaveChangesAsync();

        BulkAssignCourierResultDto result = await Claim(ctx, "user-me", parcel.Id);

        Assert.Empty(result.Succeeded);
        Assert.Single(result.Failed);
        Assert.Null(parcel.CourierId);
    }

    [Fact]
    public async Task Standalone_return_is_rejected()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Fixtures.AddCourier(ctx, "user-me");
        Order ret = Fixtures.AddReturn(ctx, courierId: null, OrderStatus.AdminAcceptedOrderInWareHouse);
        await ctx.SaveChangesAsync();

        BulkAssignCourierResultDto result = await Claim(ctx, "user-me", ret.Id);

        Assert.Empty(result.Succeeded);
        Assert.Single(result.Failed);
        Assert.Null(ret.CourierId);
    }

    [Fact]
    public async Task Mixed_batch_claims_the_valid_ones_and_reports_the_rest()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity me = Fixtures.AddCourier(ctx, "user-me");
        CourierEntity other = Fixtures.AddCourier(ctx, "user-other");
        Order free = AddSend(ctx, OrderStatus.AdminAcceptedOrderInWareHouse);
        Order taken = AddSend(ctx, OrderStatus.CourierAssignedToDeliver, other.Id);
        await ctx.SaveChangesAsync();

        BulkAssignCourierResultDto result = await Claim(ctx, "user-me", free.Id, taken.Id, Guid.NewGuid());

        Assert.Equal(new[] { free.Id }, result.Succeeded);
        Assert.Equal(2, result.Failed.Count);   // the taken one + the unknown id
        Assert.Equal(me.Id, free.CourierId);
        Assert.Equal(other.Id, taken.CourierId);
    }
}
