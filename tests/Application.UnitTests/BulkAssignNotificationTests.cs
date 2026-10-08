using Application.Common.Interfaces;
using Application.GroupOrders.Commands.AssignCourierToGroupOrder;
using Application.Orders.Commands;
using Domain;
using Domain.Enums;
using Persistence;
using CourierEntity = Domain.Courier;

namespace Application.UnitTests;

/// <summary>
/// Bulk-assigning N orders must queue ONE notification job for the courier (one push, N recipient
/// SMS inside it) — not N jobs. N jobs meant N DI scopes and N subscription queries competing with
/// the list refetches that follow an assign, which slowed those queries 20-50x in production.
/// </summary>
public sealed class BulkAssignNotificationTests
{
    private sealed class RecordingNotifier : IOrderAssignmentNotifier
    {
        public int SingleCalls;
        public readonly List<(Guid CourierId, IReadOnlyList<AssignedDeliveryNotice> Deliveries)> BulkCalls = new();

        public void NotifyCourierAssigned(
            Guid courierId, string recipientPhone, string trackingNumber,
            string? senderBusinessName, string recipientCity, string recipientDistrict) => SingleCalls++;

        public void NotifyCourierAssignedPickup(
            Guid courierId, string? senderBusinessName, string pickUpCity, string pickUpDistrict) { }

        public void NotifyCourierAssignedBulk(Guid courierId, IReadOnlyList<AssignedDeliveryNotice> deliveries)
            => BulkCalls.Add((courierId, deliveries));

        public void NotifyCourierAssignedPickupBulk(Guid courierId, IReadOnlyList<AssignedPickupNotice> pickups) { }
    }

    private static Order AddParcel(AppDbContext ctx, OrderStatus status, Guid? courierId = null)
    {
        Order order = new()
        {
            TrackingNumber    = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName     = "Recipient",
            RecipientPhone    = "555111222",
            RecipientCity     = "Tbilisi",
            RecipientDistrict = "District",
            RecipientAddress  = "Some street 1",
            OrderType         = OrderType.Send,
            Status            = status,
            CourierId         = courierId,
            CreatedAt         = CustomTime.Now,
        };
        ctx.Orders.Add(order);
        return order;
    }

    [Fact]
    public async Task Bulk_assign_queues_one_notification_job_for_all_orders()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx, "user-1");
        List<Order> parcels = Enumerable.Range(0, 5)
            .Select(_ => AddParcel(ctx, OrderStatus.AdminAcceptedOrderInWareHouse))
            .ToList();
        await ctx.SaveChangesAsync();

        RecordingNotifier notifier = new();
        BulkAssignCourierToOrdersCommandHandler handler = new(ctx, notifier);

        BulkAssignCourierResultDto result = await handler.Handle(
            new BulkAssignCourierToOrdersCommand(parcels.Select(p => p.Id).ToList(), courier.Id),
            CancellationToken.None);

        Assert.Equal(5, result.Succeeded.Count);
        Assert.Equal(0, notifier.SingleCalls);
        (Guid courierId, IReadOnlyList<AssignedDeliveryNotice> deliveries) = Assert.Single(notifier.BulkCalls);
        Assert.Equal(courier.Id, courierId);
        Assert.Equal(5, deliveries.Count);
        Assert.Equal(
            parcels.Select(p => p.TrackingNumber).OrderBy(x => x),
            deliveries.Select(d => d.TrackingNumber).OrderBy(x => x));
    }

    [Fact]
    public async Task Orders_already_with_the_courier_are_not_re_notified()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx, "user-1");
        Order already = AddParcel(ctx, OrderStatus.CourierAssignedToDeliver, courier.Id);
        Order fresh   = AddParcel(ctx, OrderStatus.AdminAcceptedOrderInWareHouse);
        await ctx.SaveChangesAsync();

        RecordingNotifier notifier = new();
        BulkAssignCourierToOrdersCommandHandler handler = new(ctx, notifier);

        await handler.Handle(
            new BulkAssignCourierToOrdersCommand(new[] { already.Id, fresh.Id }, courier.Id),
            CancellationToken.None);

        (_, IReadOnlyList<AssignedDeliveryNotice> deliveries) = Assert.Single(notifier.BulkCalls);
        AssignedDeliveryNotice only = Assert.Single(deliveries);
        Assert.Equal(fresh.TrackingNumber, only.TrackingNumber);
    }

    private sealed class RecordingRealtime : IRealtimeNotifier
    {
        public int AdminPings;
        public readonly List<Guid> CourierPings = new();

        public void NotifyAdminsOrdersChanged() => AdminPings++;
        public void NotifyCourierOrdersChanged(Guid courierId) => CourierPings.Add(courierId);
    }

    // RealtimeDashboardInterceptor pings admins and both couriers whenever CourierId changes,
    // so the handler must not repeat it — only a same-courier retry (CourierId unchanged) needs
    // the explicit courier ping.
    [Fact]
    public async Task Single_assign_to_a_new_courier_leaves_pings_to_the_interceptor()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx, "user-1");
        Order parcel = AddParcel(ctx, OrderStatus.AdminAcceptedOrderInWareHouse);
        await ctx.SaveChangesAsync();

        RecordingRealtime realtime = new();
        RecordingNotifier notifier = new();
        AssignCourierToOrderCommandHandler handler = new(ctx, realtime, notifier);

        await handler.Handle(new AssignCourierToOrderCommand(parcel.Id, courier.Id), CancellationToken.None);

        Assert.Equal(0, realtime.AdminPings);
        Assert.Empty(realtime.CourierPings);
        Assert.Equal(1, notifier.SingleCalls);
    }

    [Fact]
    public async Task Single_assign_to_the_same_courier_pings_that_courier_and_does_not_re_notify()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx, "user-1");
        Order parcel = AddParcel(ctx, OrderStatus.DeliveryPostponed, courier.Id);
        await ctx.SaveChangesAsync();

        RecordingRealtime realtime = new();
        RecordingNotifier notifier = new();
        AssignCourierToOrderCommandHandler handler = new(ctx, realtime, notifier);

        await handler.Handle(new AssignCourierToOrderCommand(parcel.Id, courier.Id), CancellationToken.None);

        Assert.Equal(courier.Id, Assert.Single(realtime.CourierPings));
        Assert.Equal(0, notifier.SingleCalls);
    }

    [Fact]
    public async Task Bulk_pickup_assign_queues_one_notification_job_for_all_batches()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx, "user-1");
        List<GroupOrder> batches = Enumerable.Range(0, 3).Select(i => new GroupOrder
        {
            SenderFirstName    = "Sender",
            SenderLastName     = "Sender",
            SenderBusinessName = $"Shop {i}",
            SenderPhone        = "555000111",
            PickUpCity         = "Tbilisi",
            PickUpDistrict     = "District",
            PickUpAddress      = "Pickup street 1",
            Status             = OrderStatus.AcceptedGroupOrder,
        }).ToList();
        ctx.GroupOrders.AddRange(batches);
        await ctx.SaveChangesAsync();

        PickupRecordingNotifier notifier = new();
        BulkAssignCourierToGroupOrdersCommandHandler handler = new(ctx, notifier);

        BulkAssignCourierToGroupOrdersResultDto result = await handler.Handle(
            new BulkAssignCourierToGroupOrdersCommand(batches.Select(b => b.Id).ToList(), courier.Id),
            CancellationToken.None);

        Assert.Equal(3, result.Succeeded.Count);
        Assert.Equal(0, notifier.SingleCalls);
        (Guid courierId, IReadOnlyList<AssignedPickupNotice> pickups) = Assert.Single(notifier.BulkCalls);
        Assert.Equal(courier.Id, courierId);
        Assert.Equal(3, pickups.Count);
    }

    private sealed class PickupRecordingNotifier : IOrderAssignmentNotifier
    {
        public int SingleCalls;
        public readonly List<(Guid CourierId, IReadOnlyList<AssignedPickupNotice> Pickups)> BulkCalls = new();

        public void NotifyCourierAssigned(
            Guid courierId, string recipientPhone, string trackingNumber,
            string? senderBusinessName, string recipientCity, string recipientDistrict) { }

        public void NotifyCourierAssignedPickup(
            Guid courierId, string? senderBusinessName, string pickUpCity, string pickUpDistrict) => SingleCalls++;

        public void NotifyCourierAssignedBulk(Guid courierId, IReadOnlyList<AssignedDeliveryNotice> deliveries) { }

        public void NotifyCourierAssignedPickupBulk(Guid courierId, IReadOnlyList<AssignedPickupNotice> pickups)
            => BulkCalls.Add((courierId, pickups));
    }

    [Fact]
    public async Task No_notification_job_when_nothing_was_assigned()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx, "user-1");
        Order delivered = AddParcel(ctx, OrderStatus.DeliveredToRecipient);
        await ctx.SaveChangesAsync();

        RecordingNotifier notifier = new();
        BulkAssignCourierToOrdersCommandHandler handler = new(ctx, notifier);

        BulkAssignCourierResultDto result = await handler.Handle(
            new BulkAssignCourierToOrdersCommand(new[] { delivered.Id }, courier.Id),
            CancellationToken.None);

        Assert.Empty(result.Succeeded);
        Assert.Empty(notifier.BulkCalls);
        Assert.Equal(0, notifier.SingleCalls);
    }
}
