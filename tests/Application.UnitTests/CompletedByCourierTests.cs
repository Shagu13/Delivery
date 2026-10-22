using Application.Couriers.Queries.CompletedByCourier;
using Domain;
using Domain.Enums;
using Persistence;
using CourierEntity = Domain.Courier;

namespace Application.UnitTests;

/// <summary>
/// The Couriers → Completed tab reads: which orders count as "finished by this courier" on the
/// delivery leg (delivered, billable-failed, standalone Return) and which pickup batches the
/// courier brought to the warehouse, for a Georgian day range.
/// </summary>
public sealed class CompletedByCourierTests
{
    private static readonly DateTime Day = new(2026, 10, 20, 14, 30, 0);

    private static Task<IReadOnlyList<CompletedDeliveryDto>> Deliveries(AppDbContext ctx, Guid? courierId, DateTime? from = null, DateTime? to = null) =>
        new GetCompletedDeliveriesQueryHandler(ctx)
            .Handle(new GetCompletedDeliveriesQuery(courierId, from ?? Day.Date, to ?? Day.Date), CancellationToken.None);

    private static CourierEntity AddCourier(AppDbContext ctx, string userId)
    {
        CourierEntity courier = new()
        {
            FirstName = "Cou", LastName = userId, IdNumber = "01001",
            PhoneNumber = "555000111", AssignedCity = "City", AssignedDistrict = "District",
            ApplicationUserId = userId,
        };
        ctx.Couriers.Add(courier);
        return courier;
    }

    private static Order AddOrder(AppDbContext ctx, Guid? courierId, OrderType type = OrderType.Send,
        OrderStatus status = OrderStatus.DeliveredToRecipient) =>
        ctx.Orders.Add(new Order
        {
            TrackingNumber    = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName     = "Recipient",
            RecipientPhone    = "555111222",
            RecipientCity     = "City",
            RecipientDistrict = "District",
            RecipientAddress  = "Some street 1",
            OrderType         = type,
            Status            = status,
            CourierId         = courierId,
            CreatedAt         = Day.AddDays(-3),
        }).Entity;

    [Fact]
    public async Task Delivered_order_is_listed_only_inside_the_date_range()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = AddCourier(ctx, "u1");
        AddOrder(ctx, courier.Id).DeliveredAt = Day;                   // inside
        AddOrder(ctx, courier.Id).DeliveredAt = Day.AddDays(-1);       // day before
        AddOrder(ctx, courier.Id).DeliveredAt = Day.Date.AddDays(1);   // midnight next day: exclusive bound
        await ctx.SaveChangesAsync();

        IReadOnlyList<CompletedDeliveryDto> single = await Deliveries(ctx, courier.Id);
        IReadOnlyList<CompletedDeliveryDto> range  = await Deliveries(ctx, courier.Id, Day.Date.AddDays(-1), Day.Date.AddDays(1));

        Assert.Single(single);
        Assert.False(single[0].IsFailed);
        Assert.Equal(3, range.Count);
    }

    [Fact]
    public async Task Courier_filter_narrows_and_null_returns_everyone()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity a = AddCourier(ctx, "a");
        CourierEntity b = AddCourier(ctx, "b");
        AddOrder(ctx, a.Id).DeliveredAt = Day;
        AddOrder(ctx, b.Id).DeliveredAt = Day;
        AddOrder(ctx, courierId: null).DeliveredAt = Day;   // never had a last-mile courier
        await ctx.SaveChangesAsync();

        Assert.Single(await Deliveries(ctx, a.Id));
        Assert.Equal(2, (await Deliveries(ctx, null)).Count);
    }

    [Theory]
    [InlineData(CancellationReason.DidNotLike, true)]
    [InlineData(CancellationReason.WrongSize,  true)]
    [InlineData(CancellationReason.Other,      true)]
    // Not billable: cancelled before the courier reached the recipient / parcel never arrived.
    [InlineData(CancellationReason.DidNotWant,            false)]
    [InlineData(CancellationReason.WarehouseNotReceived,  false)]
    public async Task Failed_delivery_is_listed_only_when_billable(CancellationReason reason, bool listed)
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = AddCourier(ctx, "u1");
        Order order = AddOrder(ctx, courier.Id, status: OrderStatus.OrderNotAccepted);
        order.CancellationReason  = reason;
        order.CancellationComment = "note";
        order.CancelledAt         = Day;
        await ctx.SaveChangesAsync();

        IReadOnlyList<CompletedDeliveryDto> result = await Deliveries(ctx, courier.Id);

        Assert.Equal(listed, result.Count == 1);
        if (listed)
        {
            Assert.True(result[0].IsFailed);
            Assert.Equal(reason.ToString(), result[0].FailureReason);
            Assert.Equal("note", result[0].FailureComment);
        }
    }

    [Fact]
    public async Task Failed_delivery_returned_to_sender_by_admin_is_dated_by_the_couriers_attempt()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = AddCourier(ctx, "u1");
        Order order = AddOrder(ctx, courier.Id, status: OrderStatus.ReturnedToSender);
        order.CancellationReason = CancellationReason.DidNotLike;
        order.CancelledAt        = Day;
        order.DeliveredAt        = Day.AddDays(5);   // admin's later "returned to sender" stamp
        await ctx.SaveChangesAsync();

        Assert.Single(await Deliveries(ctx, courier.Id));
        Assert.Empty(await Deliveries(ctx, courier.Id, Day.Date.AddDays(5), Day.Date.AddDays(5)));
    }

    [Fact]
    public async Task Standalone_return_counts_by_warehouse_dropoff_but_a_send_orders_warehouse_stamp_does_not()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = AddCourier(ctx, "u1");
        AddOrder(ctx, courier.Id, OrderType.Return, OrderStatus.DeliveredReturnOrderToWarehouse).DeliveredToWarehouseAt = Day;
        // A Send order carries DeliveredToWarehouseAt from the pickup leg — not a last-mile completion.
        AddOrder(ctx, courier.Id, OrderType.Send, OrderStatus.AdminAcceptedOrderInWareHouse).DeliveredToWarehouseAt = Day;
        await ctx.SaveChangesAsync();

        IReadOnlyList<CompletedDeliveryDto> result = await Deliveries(ctx, courier.Id);

        Assert.Single(result);
        Assert.Equal("Return", result[0].Order.OrderType);
        Assert.False(result[0].IsFailed);
    }

    [Fact]
    public async Task Pickups_list_batches_the_courier_delivered_to_the_warehouse_in_range()
    {
        using AppDbContext ctx = TestSupport.NewContext();
        CourierEntity courier = AddCourier(ctx, "u1");
        Customer customer = TestSupport.Cust();
        ctx.Customers.Add(customer);
        AddBatch(ctx, customer.Id, courier.Id, Day);               // inside
        AddBatch(ctx, customer.Id, courier.Id, Day.AddDays(-2));   // outside
        AddBatch(ctx, customer.Id, courier.Id, null);              // still out on the road
        AddBatch(ctx, customer.Id, null, Day);                     // walk-in, no pickup courier
        await ctx.SaveChangesAsync();

        IReadOnlyList<CompletedPickupDto> result = await new GetCompletedPickupsQueryHandler(ctx)
            .Handle(new GetCompletedPickupsQuery(courier.Id, Day.Date, Day.Date), CancellationToken.None);

        Assert.Single(result);
        Assert.Equal(courier.Id, result[0].CourierId);
        Assert.Equal(Day, result[0].DeliveredToWarehouseAt);
    }

    [Fact]
    public void Range_validation_rejects_reversed_and_oversized_ranges()
    {
        GetCompletedDeliveriesQueryValidator validator = new();

        Assert.True(validator.Validate(new GetCompletedDeliveriesQuery(null, Day.Date, Day.Date)).IsValid);
        Assert.False(validator.Validate(new GetCompletedDeliveriesQuery(null, Day.Date, Day.Date.AddDays(-1))).IsValid);
        Assert.False(validator.Validate(new GetCompletedDeliveriesQuery(null, Day.Date, Day.Date.AddDays(120))).IsValid);
        Assert.False(new GetCompletedPickupsQueryValidator().Validate(new GetCompletedPickupsQuery(null, Day.Date, Day.Date.AddDays(120))).IsValid);
    }

    private static void AddBatch(AppDbContext ctx, Guid customerId, Guid? courierId, DateTime? deliveredToWarehouseAt) =>
        ctx.GroupOrders.Add(new GroupOrder
        {
            CustomerId = customerId,
            SenderFirstName = "Test", SenderLastName = "Customer", SenderBusinessName = "Biz",
            SenderPhone = "555000000",
            PickUpCity = "City", PickUpDistrict = "District", PickUpAddress = "Addr",
            NumberOfPackages = 2,
            CourierId = courierId,
            DeliveredToWarehouseAt = deliveredToWarehouseAt,
        });
}
