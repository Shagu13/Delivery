using Application.Common.Exceptions;
using Application.Orders.Commands.SoftDeletePackage;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// Soft delete of packages from the admin "Delete Package" page. Pins the two cascade
/// rules and the global-query-filter contract:
///  • deleting an order hides it everywhere; deleting the last live order of a batch also
///    hides the batch;
///  • deleting a batch hides the batch and every child order;
///  • a soft-deleted row is invisible to every normal read but still physically present
///    (kept for finance/audit), reachable only via IgnoreQueryFilters().
///
/// Each step runs on its own DbContext over a shared in-memory database, mirroring
/// production where every HTTP request is a fresh context.
/// </summary>
public sealed class PackageSoftDeleteTests
{
    // ── infrastructure ─────────────────────────────────────────────────────────
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(db)
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options);

    private static async Task<(Guid batchId, List<Guid> orderIds)> SeedBatch(string db, int orderCount)
    {
        using AppDbContext ctx = Ctx(db);
        GroupOrder batch = Fixtures.AddBatch(ctx, Fixtures.AddCustomer(ctx).Id);
        List<Guid> ids = new();
        for (int i = 0; i < orderCount; i++)
        {
            Order o = new()
            {
                TrackingNumber    = $"TN-{Guid.NewGuid():N}"[..12],
                RecipientName     = $"Recipient {i}",
                RecipientPhone    = "555111222",
                RecipientCity     = "City",
                RecipientDistrict = "District",
                RecipientAddress  = "Some street 1",
                OrderType         = OrderType.Send,
                Status            = OrderStatus.AdminAcceptedOrderInWareHouse,
                GroupOrder        = batch,
                CreatedAt         = CustomTime.Now,
            };
            ctx.Orders.Add(o);
            ids.Add(o.Id);
        }
        await ctx.SaveChangesAsync();
        return (batch.Id, ids);
    }

    private static async Task DeleteOrder(string db, Guid orderId)
    {
        using AppDbContext ctx = Ctx(db);
        await new SoftDeleteOrderCommandHandler(ctx).Handle(new SoftDeleteOrderCommand(orderId), CancellationToken.None);
    }

    private static async Task DeleteBatch(string db, Guid batchId)
    {
        using AppDbContext ctx = Ctx(db);
        await new SoftDeleteGroupOrderCommandHandler(ctx).Handle(new SoftDeleteGroupOrderCommand(batchId), CancellationToken.None);
    }

    private static async Task<BulkSoftDeleteResultDto> BulkDelete(string db, params Guid[] ids)
    {
        using AppDbContext ctx = Ctx(db);
        return await new BulkSoftDeleteOrdersCommandHandler(ctx)
            .Handle(new BulkSoftDeleteOrdersCommand(ids), CancellationToken.None);
    }

    // ── standalone order ───────────────────────────────────────────────────────
    [Fact]
    public async Task Deleting_a_standalone_return_hides_it_but_keeps_the_row()
    {
        string db = Guid.NewGuid().ToString();
        Guid retId;
        using (AppDbContext ctx = Ctx(db))
        {
            Order ret = Fixtures.AddReturn(ctx, courierId: null, OrderStatus.CourierAssignedToPickUp, Fixtures.AddCustomer(ctx).Id);
            await ctx.SaveChangesAsync();
            retId = ret.Id;
        }

        await DeleteOrder(db, retId);

        using AppDbContext read = Ctx(db);
        Assert.Empty(await read.Orders.ToListAsync());
        Order kept = Assert.Single(await read.Orders.IgnoreQueryFilters().ToListAsync());
        Assert.NotNull(kept.DateDeleted);
    }

    // ── one child of a multi-order batch ───────────────────────────────────────
    [Fact]
    public async Task Deleting_one_child_leaves_the_batch_and_the_other_child_visible()
    {
        string db = Guid.NewGuid().ToString();
        (Guid batchId, List<Guid> orderIds) = await SeedBatch(db, 2);

        await DeleteOrder(db, orderIds[0]);

        using AppDbContext read = Ctx(db);
        Assert.Single(await read.GroupOrders.ToListAsync());
        Order remaining = Assert.Single(await read.Orders.ToListAsync());
        Assert.Equal(orderIds[1], remaining.Id);
        Assert.Null((await read.GroupOrders.SingleAsync()).DateDeleted);
    }

    // ── last live child of a batch → batch disappears too ──────────────────────
    [Fact]
    public async Task Deleting_the_last_live_child_also_hides_the_batch()
    {
        string db = Guid.NewGuid().ToString();
        (Guid batchId, List<Guid> orderIds) = await SeedBatch(db, 2);

        await DeleteOrder(db, orderIds[0]);
        await DeleteOrder(db, orderIds[1]);

        using AppDbContext read = Ctx(db);
        Assert.Empty(await read.Orders.ToListAsync());
        Assert.Empty(await read.GroupOrders.ToListAsync());
        Assert.Equal(2, await read.Orders.IgnoreQueryFilters().CountAsync());
        Assert.NotNull((await read.GroupOrders.IgnoreQueryFilters().SingleAsync()).DateDeleted);
    }

    [Fact]
    public async Task Deleting_the_only_child_of_a_single_package_batch_hides_the_batch()
    {
        string db = Guid.NewGuid().ToString();
        (Guid batchId, List<Guid> orderIds) = await SeedBatch(db, 1);

        await DeleteOrder(db, orderIds[0]);

        using AppDbContext read = Ctx(db);
        Assert.Empty(await read.GroupOrders.ToListAsync());
        Assert.NotNull((await read.GroupOrders.IgnoreQueryFilters().SingleAsync()).DateDeleted);
    }

    // ── deleting the whole batch ───────────────────────────────────────────────
    [Fact]
    public async Task Deleting_a_batch_hides_the_batch_and_every_child()
    {
        string db = Guid.NewGuid().ToString();
        (Guid batchId, List<Guid> orderIds) = await SeedBatch(db, 3);

        await DeleteBatch(db, batchId);

        using AppDbContext read = Ctx(db);
        Assert.Empty(await read.GroupOrders.ToListAsync());
        Assert.Empty(await read.Orders.ToListAsync());
        Assert.Equal(3, await read.Orders.IgnoreQueryFilters().CountAsync(o => o.DateDeleted != null));
        Assert.Equal(1, await read.GroupOrders.IgnoreQueryFilters().CountAsync(g => g.DateDeleted != null));
    }

    // ── bulk multi-select delete ──────────────────────────────────────────────
    [Fact]
    public async Task Bulk_delete_removes_every_selected_package_and_keeps_untouched_siblings()
    {
        string db = Guid.NewGuid().ToString();
        (Guid batchA, List<Guid> a) = await SeedBatch(db, 3);
        (Guid batchB, List<Guid> b) = await SeedBatch(db, 2);

        BulkSoftDeleteResultDto result = await BulkDelete(db, a[0], a[1], b[0]);

        Assert.Equal(3, result.DeletedOrders);
        Assert.Equal(0, result.DeletedBatches);
        Assert.Empty(result.NotFound);

        using AppDbContext read = Ctx(db);
        List<Guid> live = await read.Orders.Select(o => o.Id).ToListAsync();
        Assert.Equal(2, live.Count);
        Assert.Contains(a[2], live);
        Assert.Contains(b[1], live);
        Assert.Equal(2, await read.GroupOrders.CountAsync());
    }

    [Fact]
    public async Task Bulk_delete_that_empties_a_batch_also_hides_the_batch()
    {
        string db = Guid.NewGuid().ToString();
        (Guid batchA, List<Guid> a) = await SeedBatch(db, 2);
        (Guid batchB, List<Guid> b) = await SeedBatch(db, 2);

        // Every package of batch A, plus one from batch B.
        BulkSoftDeleteResultDto result = await BulkDelete(db, a[0], a[1], b[0]);

        Assert.Equal(3, result.DeletedOrders);
        Assert.Equal(1, result.DeletedBatches);

        using AppDbContext read = Ctx(db);
        Guid remainingBatch = Assert.Single(await read.GroupOrders.Select(g => g.Id).ToListAsync());
        Assert.Equal(batchB, remainingBatch);
    }

    [Fact]
    public async Task Bulk_delete_reports_unknown_ids_without_failing_the_request()
    {
        string db = Guid.NewGuid().ToString();
        (Guid batchId, List<Guid> ids) = await SeedBatch(db, 2);
        Guid ghost = Guid.NewGuid();

        BulkSoftDeleteResultDto result = await BulkDelete(db, ids[0], ghost);

        Assert.Equal(1, result.DeletedOrders);
        Assert.Equal(ghost, Assert.Single(result.NotFound));

        using AppDbContext read = Ctx(db);
        Assert.Single(await read.Orders.ToListAsync());
    }

    // ── not found / idempotency ────────────────────────────────────────────────
    [Fact]
    public async Task Deleting_an_unknown_order_throws_NotFound()
    {
        string db = Guid.NewGuid().ToString();
        await Assert.ThrowsAsync<NotFoundException>(() => DeleteOrder(db, Guid.NewGuid()));
    }

    [Fact]
    public async Task Deleting_an_already_deleted_order_throws_NotFound_the_second_time()
    {
        string db = Guid.NewGuid().ToString();
        Guid retId;
        using (AppDbContext ctx = Ctx(db))
        {
            Order ret = Fixtures.AddReturn(ctx, courierId: null, OrderStatus.CourierAssignedToPickUp, Fixtures.AddCustomer(ctx).Id);
            await ctx.SaveChangesAsync();
            retId = ret.Id;
        }

        await DeleteOrder(db, retId);
        await Assert.ThrowsAsync<NotFoundException>(() => DeleteOrder(db, retId));
    }
}
