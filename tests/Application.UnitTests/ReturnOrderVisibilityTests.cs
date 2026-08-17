using Application.Common.Exceptions;
using Application.Courier.Queries;
using Application.GroupOrders.Commands.AttachOrdersToGroupOrder;
using Application.GroupOrders.Commands.GroupAndAcceptStandaloneOrder;
using Application.GroupOrders.Commands.GroupAndWarehouseStandaloneOrder;
using Application.GroupOrders.Queries.GetCustomerUnattachedOrders;
using Application.GroupOrders.Queries.GetPickupDay;
using Application.Orders.Commands;
using Domain;
using Domain.Enums;
using Persistence;
using CourierEntity = Domain.Courier;

namespace Application.UnitTests;

/// <summary>
/// Whether a standalone Return order is visible on the courier's dashboard, across every
/// status it can be in and every path that assigns a courier to it.
///
/// The courier's Pickups tab lists a Return only while it is CourierAssignedToPickUp or
/// PickedUpFromRecipient, so anything that leaves the order outside those two statuses
/// hides it from the courier who is supposed to collect it. These tests pin that contract
/// down from both ends: what the query returns, and what each assignment/grouping path
/// leaves the status as.
/// </summary>
public sealed class ReturnOrderVisibilityTests
{
    // ── A. What the courier's dashboard shows ────────────────────────────────────

    [Theory]
    // Visible: the two statuses that mean "this parcel is still out there, go get it".
    [InlineData(OrderStatus.CourierAssignedToPickUp,          true)]
    [InlineData(OrderStatus.PickedUpFromRecipient,            true)]
    // Not yet assigned/promoted — the courier has nothing to act on.
    [InlineData(OrderStatus.Pending,                          false)]
    // Batch statuses a Return should never hold. It has a courier but they cannot see it:
    // this is the production bug the grouping guards + assignment promotion fix.
    [InlineData(OrderStatus.AcceptedOrder,                    false)]
    [InlineData(OrderStatus.AcceptedGroupOrder,               false)]
    [InlineData(OrderStatus.CourierDeliveringToWarehouse,     false)]
    [InlineData(OrderStatus.DeliveredToWarehouse,             false)]
    [InlineData(OrderStatus.AdminAcceptedOrderInWareHouse,    false)]
    // Correctly gone: the return job is finished, or cancelled.
    [InlineData(OrderStatus.DeliveredReturnOrderToWarehouse,  false)]
    [InlineData(OrderStatus.ReturnedToSender,                 false)]
    [InlineData(OrderStatus.CancelledByAdmin,                 false)]
    public async Task Return_visibility_follows_status(OrderStatus status, bool expectedVisible)
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Fixtures.AddReturn(ctx, courier.Id, status);
        await ctx.SaveChangesAsync();

        IReadOnlyList<Application.Couriers.DTOs.CourierOrderDto> visible = await Fixtures.ReturnPickups(ctx, courier);

        Assert.Equal(expectedVisible, visible.Count == 1);
    }

    [Fact]
    public async Task Unassigned_return_is_invisible_to_every_courier()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Fixtures.AddReturn(ctx, courierId: null, OrderStatus.CourierAssignedToPickUp);
        await ctx.SaveChangesAsync();

        Assert.Empty(await Fixtures.ReturnPickups(ctx, courier));
    }

    [Fact]
    public async Task Return_is_visible_only_to_the_courier_it_is_assigned_to()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity mine  = Fixtures.AddCourier(ctx, "user-mine");
        CourierEntity other = Fixtures.AddCourier(ctx, "user-other");
        Fixtures.AddReturn(ctx, other.Id, OrderStatus.CourierAssignedToPickUp);
        await ctx.SaveChangesAsync();

        Assert.Empty(await Fixtures.ReturnPickups(ctx, mine));
        Assert.Single(await Fixtures.ReturnPickups(ctx, other));
    }

    [Theory]
    [InlineData(OrderType.Send)]
    [InlineData(OrderType.Exchange)]
    public async Task Non_return_orders_never_appear_in_return_pickups(OrderType type)
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Order order = Fixtures.AddReturn(ctx, courier.Id, OrderStatus.CourierAssignedToPickUp);
        order.OrderType = type;
        await ctx.SaveChangesAsync();

        Assert.Empty(await Fixtures.ReturnPickups(ctx, courier));
    }

    [Fact]
    public async Task Return_that_was_wrongly_batched_still_shows_while_its_status_is_right()
    {
        // Being inside a batch is not itself what hides a return — the query does not filter
        // on GroupOrderId. It is the status the batch actions rewrite that hides it. This is
        // why re-assigning the courier repairs the 3 stranded production rows.
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        GroupOrder batch = Fixtures.AddBatch(ctx, Fixtures.AddCustomer(ctx).Id);
        Order ret = Fixtures.AddReturn(ctx, courier.Id, OrderStatus.CourierAssignedToPickUp);
        ret.GroupOrderId = batch.Id;
        ret.CustomerId   = null;
        await ctx.SaveChangesAsync();

        Assert.Single(await Fixtures.ReturnPickups(ctx, courier));
    }

    // ── B. Assigning a courier puts the return in front of them ──────────────────

    [Theory]
    // Everything before the parcel is collected must land on CourierAssignedToPickUp,
    // including a return stranded in a batch status.
    [InlineData(OrderStatus.Pending,                        OrderStatus.CourierAssignedToPickUp)]
    [InlineData(OrderStatus.AcceptedOrder,                  OrderStatus.CourierAssignedToPickUp)]
    [InlineData(OrderStatus.AcceptedGroupOrder,             OrderStatus.CourierAssignedToPickUp)]
    [InlineData(OrderStatus.DeliveredToWarehouse,           OrderStatus.CourierAssignedToPickUp)]
    [InlineData(OrderStatus.AdminAcceptedOrderInWareHouse,  OrderStatus.CourierAssignedToPickUp)]
    [InlineData(OrderStatus.CourierAssignedToPickUp,        OrderStatus.CourierAssignedToPickUp)]
    // Past the collection the status is kept — a courier swap must not rewind the flow.
    [InlineData(OrderStatus.PickedUpFromRecipient,           OrderStatus.PickedUpFromRecipient)]
    [InlineData(OrderStatus.DeliveredReturnOrderToWarehouse, OrderStatus.DeliveredReturnOrderToWarehouse)]
    [InlineData(OrderStatus.ReturnedToSender,                OrderStatus.ReturnedToSender)]
    [InlineData(OrderStatus.CancelledByAdmin,                OrderStatus.CancelledByAdmin)]
    public async Task Assigning_a_courier_sets_the_status_the_courier_can_see(
        OrderStatus start, OrderStatus expected)
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Order ret = Fixtures.AddReturn(ctx, courierId: null, start);
        await ctx.SaveChangesAsync();

        await new AssignCourierToReturnOrderCommandHandler(ctx)
            .Handle(new AssignCourierToReturnOrderCommand(ret.Id, courier.Id), CancellationToken.None);

        Assert.Equal(expected, ret.Status);
        Assert.Equal(courier.Id, ret.CourierId);
        Assert.NotNull(ret.AssignedToCourierAt);
    }

    [Theory]
    [InlineData(OrderStatus.Pending)]
    [InlineData(OrderStatus.AcceptedOrder)]
    [InlineData(OrderStatus.AdminAcceptedOrderInWareHouse)]
    [InlineData(OrderStatus.DeliveredToWarehouse)]
    public async Task Assigning_a_courier_makes_a_stranded_return_appear_on_their_dashboard(OrderStatus start)
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Order ret = Fixtures.AddReturn(ctx, courierId: null, start);
        await ctx.SaveChangesAsync();

        Assert.Empty(await Fixtures.ReturnPickups(ctx, courier));

        await new AssignCourierToReturnOrderCommandHandler(ctx)
            .Handle(new AssignCourierToReturnOrderCommand(ret.Id, courier.Id), CancellationToken.None);

        Assert.Single(await Fixtures.ReturnPickups(ctx, courier));
    }

    [Fact]
    public async Task Reassigning_moves_the_return_between_couriers()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity first  = Fixtures.AddCourier(ctx, "user-first");
        CourierEntity second = Fixtures.AddCourier(ctx, "user-second");
        Order ret = Fixtures.AddReturn(ctx, first.Id, OrderStatus.CourierAssignedToPickUp);
        await ctx.SaveChangesAsync();

        await new AssignCourierToReturnOrderCommandHandler(ctx)
            .Handle(new AssignCourierToReturnOrderCommand(ret.Id, second.Id), CancellationToken.None);

        Assert.Empty(await Fixtures.ReturnPickups(ctx, first));
        Assert.Single(await Fixtures.ReturnPickups(ctx, second));
    }

    [Fact]
    public async Task Return_assignment_endpoint_rejects_a_send_order()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Order send = Fixtures.AddReturn(ctx, courierId: null, OrderStatus.Pending);
        send.OrderType = OrderType.Send;
        await ctx.SaveChangesAsync();

        await Assert.ThrowsAsync<ConflictException>(() =>
            new AssignCourierToReturnOrderCommandHandler(ctx)
                .Handle(new AssignCourierToReturnOrderCommand(send.Id, courier.Id), CancellationToken.None));
    }

    // ── C. Bulk assign follows the same rule ─────────────────────────────────────

    [Theory]
    [InlineData(OrderStatus.Pending,                         OrderStatus.CourierAssignedToPickUp)]
    [InlineData(OrderStatus.AdminAcceptedOrderInWareHouse,   OrderStatus.CourierAssignedToPickUp)]
    // No rewind: the parcel is already collected / at the warehouse / back with the sender.
    [InlineData(OrderStatus.PickedUpFromRecipient,           OrderStatus.PickedUpFromRecipient)]
    [InlineData(OrderStatus.DeliveredReturnOrderToWarehouse, OrderStatus.DeliveredReturnOrderToWarehouse)]
    [InlineData(OrderStatus.ReturnedToSender,                OrderStatus.ReturnedToSender)]
    public async Task Bulk_assign_never_rewinds_a_collected_return(OrderStatus start, OrderStatus expected)
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Order ret = Fixtures.AddReturn(ctx, courierId: null, start);
        await ctx.SaveChangesAsync();

        BulkAssignCourierResultDto result = await new BulkAssignCourierToOrdersCommandHandler(ctx, new NoopAssignmentNotifier())
            .Handle(new BulkAssignCourierToOrdersCommand(new[] { ret.Id }, courier.Id), CancellationToken.None);

        Assert.Single(result.Succeeded);
        Assert.Equal(expected, ret.Status);
        Assert.Equal(courier.Id, ret.CourierId);
    }

    [Fact]
    public async Task Bulk_assign_hands_the_return_to_the_new_courier_only()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity first  = Fixtures.AddCourier(ctx, "user-first");
        CourierEntity second = Fixtures.AddCourier(ctx, "user-second");
        Order ret = Fixtures.AddReturn(ctx, first.Id, OrderStatus.CourierAssignedToPickUp);
        await ctx.SaveChangesAsync();

        await new BulkAssignCourierToOrdersCommandHandler(ctx, new NoopAssignmentNotifier())
            .Handle(new BulkAssignCourierToOrdersCommand(new[] { ret.Id }, second.Id), CancellationToken.None);

        Assert.Empty(await Fixtures.ReturnPickups(ctx, first));
        Assert.Single(await Fixtures.ReturnPickups(ctx, second));
    }

    // ── D. Nothing may batch a Return back out of view ───────────────────────────

    [Fact]
    public async Task Group_and_accept_refuses_a_return_and_leaves_it_visible()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Customer customer = Fixtures.AddCustomer(ctx);
        Order ret = Fixtures.AddReturn(ctx, courier.Id, OrderStatus.CourierAssignedToPickUp, customer.Id);
        await ctx.SaveChangesAsync();

        await Assert.ThrowsAsync<ConflictException>(() =>
            new GroupAndAcceptStandaloneOrderCommandHandler(ctx, new UnusedSender())
                .Handle(new GroupAndAcceptStandaloneOrderCommand(ret.Id), CancellationToken.None));

        Assert.Null(ret.GroupOrderId);
        Assert.Equal(OrderStatus.CourierAssignedToPickUp, ret.Status);
        Assert.Single(await Fixtures.ReturnPickups(ctx, courier));
    }

    [Fact]
    public async Task Group_and_warehouse_refuses_a_return_and_leaves_it_visible()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Customer customer = Fixtures.AddCustomer(ctx);
        Order ret = Fixtures.AddReturn(ctx, courier.Id, OrderStatus.CourierAssignedToPickUp, customer.Id);
        await ctx.SaveChangesAsync();

        await Assert.ThrowsAsync<ConflictException>(() =>
            new GroupAndWarehouseStandaloneOrderCommandHandler(ctx, new UnusedSender())
                .Handle(new GroupAndWarehouseStandaloneOrderCommand(ret.Id, null, courier.Id), CancellationToken.None));

        Assert.Null(ret.GroupOrderId);
        Assert.Equal(OrderStatus.CourierAssignedToPickUp, ret.Status);
        Assert.Single(await Fixtures.ReturnPickups(ctx, courier));
    }

    [Fact]
    public async Task Grouping_a_day_attaches_the_send_and_skips_the_return()
    {
        // The grouping modal pre-selects every unattached order, which is how 24 returns
        // ended up batched on production. A return in the selection is now skipped rather
        // than swept in — and the rest of the selection still groups normally.
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = Fixtures.AddCourier(ctx);
        Customer customer = Fixtures.AddCustomer(ctx);
        Order send = Fixtures.AddReturn(ctx, courierId: null, OrderStatus.Pending, customer.Id);
        send.OrderType = OrderType.Send;
        Order ret = Fixtures.AddReturn(ctx, courier.Id, OrderStatus.CourierAssignedToPickUp, customer.Id);
        await ctx.SaveChangesAsync();

        await new AttachOrdersToGroupOrderCommandHandler(ctx, new NoopRealtimeNotifier())
            .Handle(new AttachOrdersToGroupOrderCommand(
                customer.Id, ret.CreatedAt, new[] { send.Id, ret.Id }), CancellationToken.None);

        Assert.NotNull(send.GroupOrderId);
        Assert.Null(ret.GroupOrderId);
        Assert.Equal(customer.Id, ret.CustomerId);   // owner link survives
        Assert.Single(await Fixtures.ReturnPickups(ctx, courier));
    }

    [Fact]
    public async Task Grouping_a_selection_of_only_returns_fails_instead_of_creating_an_empty_batch()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Customer customer = Fixtures.AddCustomer(ctx);
        Order ret = Fixtures.AddReturn(ctx, courierId: null, OrderStatus.Pending, customer.Id);
        await ctx.SaveChangesAsync();

        await Assert.ThrowsAsync<ConflictException>(() =>
            new AttachOrdersToGroupOrderCommandHandler(ctx, new NoopRealtimeNotifier())
                .Handle(new AttachOrdersToGroupOrderCommand(
                    customer.Id, ret.CreatedAt, new[] { ret.Id }), CancellationToken.None));

        Assert.Empty(ctx.GroupOrders);
    }

    [Fact]
    public async Task Grouping_modal_does_not_list_returns()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Customer customer = Fixtures.AddCustomer(ctx);
        Order send = Fixtures.AddReturn(ctx, courierId: null, OrderStatus.Pending, customer.Id);
        send.OrderType = OrderType.Send;
        Fixtures.AddReturn(ctx, courierId: null, OrderStatus.Pending, customer.Id);
        await ctx.SaveChangesAsync();

        var unattached = await new GetCustomerUnattachedOrdersQueryHandler(ctx)
            .Handle(new GetCustomerUnattachedOrdersQuery(customer.Id, CustomTime.Today), CancellationToken.None);

        Assert.Single(unattached);
        Assert.Equal(OrderType.Send, unattached[0].OrderType);
    }

    [Fact]
    public async Task Ungrouped_badge_does_not_count_returns()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Customer customer = Fixtures.AddCustomer(ctx);
        Order send = Fixtures.AddReturn(ctx, courierId: null, OrderStatus.Pending, customer.Id);
        send.OrderType = OrderType.Send;
        Fixtures.AddReturn(ctx, courierId: null, OrderStatus.Pending, customer.Id);
        await ctx.SaveChangesAsync();

        var day = await new GetPickupDayQueryHandler(ctx)
            .Handle(new GetPickupDayQuery(CustomTime.Today), CancellationToken.None);

        Assert.Equal(2, day[0].OrdersPlaced);
        Assert.Equal(1, day[0].UnattachedOrders);
    }
}

// ── Fixtures & doubles ───────────────────────────────────────────────────────────

internal static class Fixtures
{
    public static CourierEntity AddCourier(AppDbContext ctx, string userId = "courier-user")
    {
        CourierEntity courier = new()
        {
            FirstName = "Cou", LastName = "Rier", IdNumber = "01001",
            PhoneNumber = "555000111", AssignedCity = "City", AssignedDistrict = "District",
            ApplicationUserId = userId,
        };
        ctx.Couriers.Add(courier);
        return courier;
    }

    public static Customer AddCustomer(AppDbContext ctx)
    {
        Customer customer = TestSupport.Cust();
        ctx.Customers.Add(customer);
        return customer;
    }

    public static GroupOrder AddBatch(AppDbContext ctx, Guid customerId)
    {
        GroupOrder batch = new()
        {
            CustomerId = customerId,
            SenderFirstName = "Test", SenderLastName = "Customer", SenderBusinessName = "Biz",
            SenderPhone = "555000000",
            PickUpCity = "City", PickUpDistrict = "District", PickUpAddress = "Addr",
            NumberOfPackages = 0,
        };
        ctx.GroupOrders.Add(batch);
        return batch;
    }

    /// <summary>A standalone Return order — the shape the customer's return flow creates.</summary>
    public static Order AddReturn(AppDbContext ctx, Guid? courierId, OrderStatus status, Guid? customerId = null)
    {
        Order order = new()
        {
            TrackingNumber       = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName        = "Recipient",
            RecipientPhone       = "555111222",
            RecipientCity        = "City",
            RecipientDistrict    = "District",
            RecipientAddress     = "Some street 1",
            ReturnPickupCity     = "City",
            ReturnPickupDistrict = "District",
            ReturnPickupAddress  = "Return st 2",
            OrderType            = OrderType.Return,
            Status               = status,
            CourierId            = courierId,
            CustomerId           = customerId,
            CreatedAt            = CustomTime.Now,
        };
        ctx.Orders.Add(order);
        return order;
    }

    public static Task<IReadOnlyList<Application.Couriers.DTOs.CourierOrderDto>> ReturnPickups(
        AppDbContext ctx, CourierEntity courier) =>
        new GetCourierReturnPickupsQueryHandler(ctx)
            .Handle(new GetCourierReturnPickupsQuery(courier.ApplicationUserId), CancellationToken.None);
}

/// <summary>Assignment push/SMS is fire-and-forget — nothing to observe in these tests.</summary>
internal sealed class NoopAssignmentNotifier : Application.Common.Interfaces.IOrderAssignmentNotifier
{
    public void NotifyCourierAssigned(
        Guid courierId, string recipientPhone, string trackingNumber,
        string? senderBusinessName, string recipientCity, string recipientDistrict) { }

    public void NotifyCourierAssignedPickup(
        Guid courierId, string? senderBusinessName, string pickUpCity, string pickUpDistrict) { }
}

/// <summary>SignalR refetch pings — no dashboards connected in tests.</summary>
internal sealed class NoopRealtimeNotifier : Application.Common.Interfaces.IRealtimeNotifier
{
    public void NotifyAdminsOrdersChanged() { }
    public void NotifyCourierOrdersChanged(Guid courierId) { }
}

/// <summary>
/// The grouping handlers only reach for MediatR after their Return guard passes, so any
/// call here means the guard let a Return through.
/// </summary>
internal sealed class UnusedSender : MediatR.ISender
{
    public Task<TResponse> Send<TResponse>(MediatR.IRequest<TResponse> request, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("A Return order reached the batching pipeline.");

    public Task<object?> Send(object request, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("A Return order reached the batching pipeline.");

    public Task Send<TRequest>(TRequest request, CancellationToken cancellationToken = default)
        where TRequest : MediatR.IRequest =>
        throw new InvalidOperationException("A Return order reached the batching pipeline.");

    public IAsyncEnumerable<TResponse> CreateStream<TResponse>(MediatR.IStreamRequest<TResponse> request, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("A Return order reached the batching pipeline.");

    public IAsyncEnumerable<object?> CreateStream(object request, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("A Return order reached the batching pipeline.");
}
