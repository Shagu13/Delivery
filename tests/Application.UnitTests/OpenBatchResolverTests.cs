using Application.GroupOrders.Commands.Shared;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// The resolver only has to identify the open batch (Id/Status/address); loading every order the
/// customer created today with it made a large checkout slow. Appending must still work when the
/// batch comes back without its Orders collection.
/// </summary>
public sealed class OpenBatchResolverTests
{
    private static Order NewParcel(OrderStatus status, Guid? groupOrderId = null) => new()
    {
        TrackingNumber    = $"TN-{Guid.NewGuid():N}"[..12],
        RecipientName     = "Recipient",
        RecipientPhone    = "555111222",
        RecipientCity     = "Tbilisi",
        RecipientDistrict = "District",
        RecipientAddress  = "Some street 1",
        OrderType         = OrderType.Send,
        Status            = status,
        GroupOrderId      = groupOrderId,
        CreatedAt         = CustomTime.Now,
    };

    [Fact]
    public async Task Open_batch_is_found_and_appendable_without_its_orders_being_loaded()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Guid customerId = Guid.NewGuid();
        GroupOrder batch = new()
        {
            CustomerId         = customerId,
            SenderFirstName    = "Sender",
            SenderLastName     = "Sender",
            SenderBusinessName = "Shop",
            SenderPhone        = "555000111",
            PickUpCity         = "Tbilisi",
            PickUpDistrict     = "District",
            PickUpAddress      = "Pickup street 1",
            Status             = OrderStatus.AcceptedGroupOrder,
            NumberOfPackages   = 1,
        };
        ctx.GroupOrders.Add(batch);
        ctx.Orders.Add(NewParcel(OrderStatus.AcceptedGroupOrder, batch.Id));
        await ctx.SaveChangesAsync();
        ctx.ChangeTracker.Clear();

        GroupOrder? found = await OpenBatchResolver.FindOpenBatchAsync(
            ctx, customerId, " tbilisi ", "DISTRICT", "pickup street 1", CancellationToken.None);

        Assert.NotNull(found);
        Assert.Equal(batch.Id, found.Id);
        Assert.Empty(found.Orders);

        Order added = NewParcel(OrderStatus.Pending);
        GroupOrderOrderBuilder.AttachToBatch(ctx, found, new[] { added });
        found.NumberOfPackages += 1;
        await ctx.SaveChangesAsync();
        ctx.ChangeTracker.Clear();

        List<Order> stored = await ctx.Orders.Where(o => o.GroupOrderId == batch.Id).ToListAsync();
        Assert.Equal(2, stored.Count);
        Assert.Equal(OrderStatus.AcceptedGroupOrder, stored.Single(o => o.Id == added.Id).Status);
        Assert.Equal(2, (await ctx.GroupOrders.SingleAsync(g => g.Id == batch.Id)).NumberOfPackages);
    }

    [Fact]
    public async Task A_batch_the_courier_already_collected_is_not_open()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Guid customerId = Guid.NewGuid();
        ctx.GroupOrders.Add(new GroupOrder
        {
            CustomerId         = customerId,
            SenderFirstName    = "Sender",
            SenderLastName     = "Sender",
            SenderBusinessName = "Shop",
            SenderPhone        = "555000111",
            PickUpCity         = "Tbilisi",
            PickUpDistrict     = "District",
            PickUpAddress      = "Pickup street 1",
            Status             = OrderStatus.CourierDeliveringToWarehouse,
        });
        await ctx.SaveChangesAsync();
        ctx.ChangeTracker.Clear();

        GroupOrder? found = await OpenBatchResolver.FindOpenBatchAsync(
            ctx, customerId, "Tbilisi", "District", "Pickup street 1", CancellationToken.None);

        Assert.Null(found);
    }
}
