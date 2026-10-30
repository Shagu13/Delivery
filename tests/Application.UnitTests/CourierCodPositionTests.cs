using Application.Common.Exceptions;
using Application.Finance;
using Application.Settlements.Commands;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Persistence;
using Xunit.Abstractions;

namespace Application.UnitTests;

/// <summary>
/// The courier settlement day: "To Transfer COD" (still to hand over) and "Transfered COD" (handed over, net of
/// salary the company paid separately) must always split ONE number — cash held − salary — whatever mix of
/// recorded hand-overs and salary payments exists. Salary is netted against the hand-over for either payer.
/// Each test prints the figures it asserts so the numbers can be read next to the case.
/// </summary>
public sealed class CourierCodPositionTests
{
    private readonly ITestOutputHelper _out;
    public CourierCodPositionTests(ITestOutputHelper output) => _out = output;

    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(db)
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options);

    private static Order MakeOrder(Guid courierId, ServicePayer payer, decimal cash = 25m, decimal salary = 5m) => new()
    {
        TrackingNumber            = $"TN-{Guid.NewGuid():N}"[..12],
        RecipientName             = "Recipient",
        RecipientPhone            = "555111222",
        RecipientCity             = "City",
        RecipientDistrict         = "District",
        RecipientAddress          = "Some street 1",
        OrderType                 = OrderType.Send,
        Status                    = OrderStatus.DeliveredToRecipient,
        WhoPaysForCompanyService  = payer,
        // Recipient-pays: 19 COD + 6 fee in cash = 25. Sender-pays: 25 COD only.
        AmountToCollectForPackage = payer == ServicePayer.Recipient ? cash - 6m : cash,
        CompanyServicePrice       = 6m,
        CourierId                 = courierId,
        CourierSalary             = salary,
        AmountOfCashCollected     = cash,
        DeliveredAt               = CustomTime.Now,
        CreatedAt                 = CustomTime.Now,
    };

    /// <summary>The user's example: 8 orders (6 recipient-pays, 2 sender-pays), 25 each = 200 cash, salary 5 each = 40.</summary>
    private static List<Order> EightOrderDay(Guid courierId) =>
        Enumerable.Range(0, 8)
            .Select(i => MakeOrder(courierId, i < 6 ? ServicePayer.Recipient : ServicePayer.Sender))
            .ToList();

    private static async Task Seed(string db, IEnumerable<Order> orders)
    {
        using AppDbContext ctx = Ctx(db);
        ctx.Orders.AddRange(orders);
        await ctx.SaveChangesAsync();
    }

    private static async Task<List<Order>> Load(string db)
    {
        using AppDbContext ctx = Ctx(db);
        return await ctx.Orders.AsNoTracking().OrderBy(o => o.TrackingNumber).ToListAsync();
    }

    private static async Task Pay(string db, Guid courierId, CourierPaymentFlow flow, IEnumerable<(Guid id, decimal amount)> allocs)
    {
        using AppDbContext ctx = Ctx(db);
        await new PayCourierOrdersCommandHandler(ctx).Handle(
            new PayCourierOrdersCommand(courierId, flow,
                allocs.Select(a => new CourierOrderPaymentAllocation(a.id, a.amount)).ToList()),
            CancellationToken.None);
    }

    /// <summary>What "Select All" submits for the COD bar: each payable order's full outstanding.</summary>
    private static List<(Guid, decimal)> SelectAllCod(IEnumerable<Order> orders) =>
        orders.Where(o => OrderFinance.CourierCodTransferOutstanding(o) > 0.005m)
              .Select(o => (o.Id, OrderFinance.CourierCodTransferOutstanding(o))).ToList();

    private sealed record Position(
        decimal Cash, decimal Salary, decimal ToTransfer, decimal Transfered,
        decimal SalaryPaid, decimal SalaryOutstanding, decimal SalaryNotNetted);

    /// <summary>The same sums the settlement modal shows, over the courier-leg-complete orders only.</summary>
    private static Position Sum(IEnumerable<Order> orders)
    {
        List<Order> all = orders.ToList();
        List<Order> counted = all.Where(OrderFinance.IsCourierLegComplete).ToList();
        return new Position(
            Cash:             all.Sum(OrderFinance.CourierCashHeld),
            Salary:           counted.Sum(o => o.CourierSalary ?? 0m),
            ToTransfer:       all.Sum(OrderFinance.CourierCodTransferOutstanding),
            Transfered:       all.Sum(OrderFinance.CourierCodTransfered),
            SalaryPaid:       counted.Sum(o => o.CourierSalaryPaidAmount ?? 0m),
            SalaryOutstanding: all.Sum(o => OrderFinance.IsCourierLegComplete(o) ? OrderFinance.CourierSalaryOutstanding(o) : 0m),
            // Salary that is neither netted into the hand-over nor paid separately: the only gap between the
            // two COD halves and (cash − salary).
            SalaryNotNetted:  counted.Sum(o => Math.Max(0m,
                (o.CourierSalary ?? 0m)
                - (o.IsCourierSalaryIncludedSpecialCase ? OrderFinance.CourierKeptSalary(o) : OrderFinance.CourierNettableSalary(o))
                - OrderFinance.CourierSeparateSalaryPaid(o))));
    }

    private void Show(string title, Position p)
    {
        _out.WriteLine($"┌─ {title}");
        _out.WriteLine($"│  Total cash courier holds : {p.Cash,8:0.00}");
        _out.WriteLine($"│  Courier salary           : {p.Salary,8:0.00}   (paid {p.SalaryPaid:0.00}, outstanding {p.SalaryOutstanding:0.00})");
        _out.WriteLine($"│  To Transfer COD          : {p.ToTransfer,8:0.00}");
        _out.WriteLine($"│  Transfered COD           : {p.Transfered,8:0.00}");
        _out.WriteLine($"│  Check  To+Transfered     : {p.ToTransfer + p.Transfered,8:0.00}  =  cash − salary {p.Cash - p.Salary:0.00}  + salary not netted {p.SalaryNotNetted:0.00}");
        _out.WriteLine("└─");
    }

    private static void AssertPartition(Position p) =>
        Assert.Equal(p.Cash - p.Salary + p.SalaryNotNetted, p.ToTransfer + p.Transfered);

    // ── 1. The user's example, before anything is recorded ───────────────────────────
    [Fact]
    public async Task Fresh8OrderDay_ToTransferIs160_NoMatterThePayer()
    {
        string db = $"cod-pos-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        await Seed(db, EightOrderDay(courier));
        List<Order> orders = await Load(db);

        Position p = Sum(orders);
        Show("8 orders (6 recipient-pays, 2 sender-pays), nothing recorded", p);
        _out.WriteLine($"  per-order To Transfer: {string.Join(", ", orders.Select(o => $"{o.WhoPaysForCompanyService.ToString()[0]}:{OrderFinance.CourierCodTransferOutstanding(o):0.00}"))}");
        _out.WriteLine($"  'Select All' selected total: {SelectAllCod(orders).Sum(a => a.Item2):0.00}");

        Assert.Equal(200m, p.Cash);
        Assert.Equal(40m, p.Salary);
        Assert.Equal(160m, p.ToTransfer);
        Assert.Equal(0m, p.Transfered);
        Assert.All(orders, o => Assert.Equal(20m, OrderFinance.CourierCodTransferOutstanding(o)));   // sender-pays rows too
        Assert.Equal(160m, SelectAllCod(orders).Sum(a => a.Item2));                                  // the bar records exactly the summary
        AssertPartition(p);
    }

    // ── 2. Select All → record → settled ─────────────────────────────────────────────
    [Fact]
    public async Task SelectAll_Records160_ThenEverythingIsSettledAndShownOnce()
    {
        string db = $"cod-pos-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        await Seed(db, EightOrderDay(courier));
        await Pay(db, courier, CourierPaymentFlow.CodTransfer, SelectAllCod(await Load(db)));
        List<Order> orders = await Load(db);

        Position p = Sum(orders);
        Show("after Select All → Record COD hand-over", p);
        _out.WriteLine($"  receipt total recorded: {orders.Sum(o => o.CodTransferedToCompanyByCourier ?? 0m):0.00}");

        Assert.Equal(160m, orders.Sum(o => o.CodTransferedToCompanyByCourier ?? 0m));
        Assert.Equal(0m, p.ToTransfer);
        Assert.Equal(160m, p.Transfered);
        Assert.Equal(40m, p.SalaryPaid);            // netted salary is credited, so the salary bar has nothing left…
        Assert.Equal(0m, p.SalaryOutstanding);
        AssertPartition(p);

        // …and neither flow can be paid a second time.
        await Assert.ThrowsAsync<ConflictException>(() =>
            Pay(db, courier, CourierPaymentFlow.Salary, new[] { (orders[0].Id, 5m) }));
        await Assert.ThrowsAsync<ConflictException>(() =>
            Pay(db, courier, CourierPaymentFlow.CodTransfer, new[] { (orders[0].Id, 1m) }));
    }

    // ── 3. Partial hand-over ─────────────────────────────────────────────────────────
    [Fact]
    public async Task PartialHandOver_SplitsTheSame160BetweenTheTwoBuckets()
    {
        string db = $"cod-pos-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        await Seed(db, EightOrderDay(courier));
        List<Order> orders = await Load(db);
        // Three orders: two recipient-pays and one sender-pays.
        List<Order> three = orders.Where(o => o.WhoPaysForCompanyService == ServicePayer.Recipient).Take(2)
            .Concat(orders.Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender).Take(1)).ToList();
        await Pay(db, courier, CourierPaymentFlow.CodTransfer, three.Select(o => (o.Id, 20m)));

        Position p = Sum(await Load(db));
        Show("3 of 8 orders handed over (2 recipient-pays + 1 sender-pays)", p);

        Assert.Equal(100m, p.ToTransfer);
        Assert.Equal(60m, p.Transfered);
        Assert.Equal(15m, p.SalaryPaid);            // only the 3 netted salaries are credited
        AssertPartition(p);
    }

    // ── 4. Salary paid first, in separate cash ───────────────────────────────────────
    [Fact]
    public async Task SalaryPaidSeparatelyFirst_MovesFromToTransferToTransfered_ThenFullCashIsOwed()
    {
        string db = $"cod-pos-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        await Seed(db, EightOrderDay(courier));
        List<Order> orders = await Load(db);
        await Pay(db, courier, CourierPaymentFlow.Salary, orders.Select(o => (o.Id, 5m)));

        Position afterSalary = Sum(await Load(db));
        Show("company paid all 40 salary separately, no hand-over yet", afterSalary);
        Assert.Equal(200m, afterSalary.ToTransfer);   // courier now owes the whole cash — salary was not netted
        Assert.Equal(-40m, afterSalary.Transfered);   // paid salary shows on the Transfered side
        AssertPartition(afterSalary);

        await Pay(db, courier, CourierPaymentFlow.CodTransfer, SelectAllCod(await Load(db)));
        Position settled = Sum(await Load(db));
        Show("…then Select All hand-over of the full cash", settled);
        Assert.Equal(0m, settled.ToTransfer);
        Assert.Equal(160m, settled.Transfered);       // 200 handed over − 40 salary paid separately
        Assert.Equal(40m, settled.SalaryPaid);        // not credited twice
        AssertPartition(settled);
    }

    // ── 5. Postponed orders (Assigned-date list) ─────────────────────────────────────
    [Fact]
    public async Task PostponedOrder_ContributesNothing_ToEitherBucket()
    {
        string db = $"cod-pos-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        List<Order> day = Enumerable.Range(0, 7).Select(_ => MakeOrder(courier, ServicePayer.Recipient)).ToList();
        Order postponed = MakeOrder(courier, ServicePayer.Recipient);
        postponed.Status = OrderStatus.DeliveryPostponed;
        postponed.DeliveredAt = null;
        postponed.AmountOfCashCollected = null;     // expected cash is known (25) but nothing was collected
        day.Add(postponed);
        await Seed(db, day);
        List<Order> orders = await Load(db);

        Position p = Sum(orders);
        Show("7 delivered + 1 postponed (assigned-date list)", p);
        _out.WriteLine($"  postponed order: expected cash {OrderFinance.ExpectedCourierCash(orders.Single(o => o.Status == OrderStatus.DeliveryPostponed)):0.00}, " +
                       $"cash held {OrderFinance.CourierCashHeld(orders.Single(o => o.Status == OrderStatus.DeliveryPostponed)):0.00}");

        Assert.Equal(175m, p.Cash);
        Assert.Equal(35m, p.Salary);
        Assert.Equal(140m, p.ToTransfer);
        Assert.Equal(0m, OrderFinance.CourierCodTransferOutstanding(orders.Single(o => o.Status == OrderStatus.DeliveryPostponed)));
        AssertPartition(p);
    }

    // ── 6. Billable failed delivery ──────────────────────────────────────────────────
    [Fact]
    public void BillableFailedDelivery_HasNoCash_SoItsSalaryStaysPayableInCash()
    {
        Order o = MakeOrder(Guid.NewGuid(), ServicePayer.Recipient, cash: 0m);
        o.Status = OrderStatus.CancelledByAdmin;
        o.DeliveredAt = null;
        o.CancelledAt = CustomTime.Now;
        o.CancellationReason = CancellationReason.WrongSize;

        Position p = Sum(new[] { o });
        Show("one billable failed delivery (no cash, salary 5)", p);

        Assert.True(OrderFinance.IsBillableFailedDelivery(o));
        Assert.Equal(0m, p.Cash);
        Assert.Equal(0m, p.ToTransfer);
        Assert.Equal(5m, p.SalaryOutstanding);      // nothing to net it against → the salary bar pays it
        Assert.Equal(5m, p.SalaryNotNetted);
        AssertPartition(p);
    }

    // ── 7. Salary larger than the order's cash ───────────────────────────────────────
    [Fact]
    public void SalaryAboveTheOrdersCash_NetsOnlyWhatTheCashCovers()
    {
        Order o = MakeOrder(Guid.NewGuid(), ServicePayer.Sender, cash: 3m, salary: 5m);

        Position p = Sum(new[] { o });
        Show("sender-pays order, cash 3 but salary 5", p);

        Assert.Equal(0m, p.ToTransfer);             // 3 − 3 netted
        Assert.Equal(3m, OrderFinance.CourierNettableSalary(o));
        Assert.Equal(5m, p.SalaryOutstanding);      // not yet kept: shown until the hand-over credits the netted 3
        Assert.Equal(2m, p.SalaryNotNetted);        // the 2 the cash cannot cover
        AssertPartition(p);
    }

    // ── 8. Rows recorded before this change (recipient-pays flag set, salary never credited) ──
    [Fact]
    public void LegacySettledRecipientOrder_IsSettled_AndItsKeptSalaryIsNoLongerOfferedAgain()
    {
        Order o = MakeOrder(Guid.NewGuid(), ServicePayer.Recipient, cash: 100m, salary: 4m);
        o.IsCourierSalaryIncludedSpecialCase = true;
        o.CodTransferedToCompanyByCourier    = 96m;      // old bulk hand-over: flag set, CourierSalaryPaidAmount left null

        Position p = Sum(new[] { o });
        Show("legacy row: handed 96 of 100, flag set, salary never credited", p);

        Assert.Equal(0m, p.ToTransfer);
        Assert.Equal(96m, p.Transfered);
        Assert.Equal(0m, p.SalaryOutstanding);           // previously 4 — the double-payment path
        AssertPartition(p);
    }

    // ── 9. Over-collection is rejected ───────────────────────────────────────────────
    [Fact]
    public async Task HandOverAboveThePerOrderOutstanding_IsRejected()
    {
        string db = $"cod-pos-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        await Seed(db, new[] { MakeOrder(courier, ServicePayer.Sender) });
        Order o = (await Load(db)).Single();
        _out.WriteLine($"sender-pays order cash 25, salary 5 → outstanding {OrderFinance.CourierCodTransferOutstanding(o):0.00}; trying to record 21");

        await Assert.ThrowsAsync<ConflictException>(() =>
            Pay(db, courier, CourierPaymentFlow.CodTransfer, new[] { (o.Id, 21m) }));
        Assert.Equal(0m, (await Load(db)).Single().CodTransferedToCompanyByCourier ?? 0m);
    }

    // ── 11/12. Mixed day: 5 recipient-paid fees + 3 whose fee shifted to the sender ──
    private void ShowCompany(IEnumerable<Order> orders)
    {
        List<Order> all = orders.ToList();
        _out.WriteLine($"   company side: fee total {all.Sum(o => o.CompanyServicePrice):0.00} − salary {all.Sum(o => o.CourierSalary ?? 0m):0.00} = profit {all.Sum(OrderFinance.CompanyRevenue):0.00}; " +
                       $"fee collected by courier in cash {all.Where(o => OrderFinance.CourierCashHeld(o) > 0 && !OrderFinance.SenderOwesService(o)).Sum(OrderFinance.RecipientFeePortion):0.00}; " +
                       $"fee owed by senders {all.Sum(OrderFinance.ServiceOwedBySender):0.00}");
    }

    [Fact]
    public async Task Mixed_5RecipientPaid_3BillableFailed_SenderOwes18_SalaryOf15StaysPayable()
    {
        string db = $"cod-pos-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        List<Order> day = Enumerable.Range(0, 5).Select(_ => MakeOrder(courier, ServicePayer.Recipient)).ToList();
        for (int i = 0; i < 3; i++)
        {
            Order failed = MakeOrder(courier, ServicePayer.Recipient, cash: 0m);
            failed.Status = OrderStatus.CancelledByAdmin; failed.DeliveredAt = null;
            failed.CancelledAt = CustomTime.Now; failed.CancellationReason = CancellationReason.WrongSize;
            failed.AmountToCollectForPackage = 19m;
            day.Add(failed);
        }
        await Seed(db, day);

        Position start = Sum(await Load(db));
        Show("A) 5 delivered (fee paid by recipient) + 3 billable failed — before recording", start);
        ShowCompany(await Load(db));
        Assert.Equal(100m, start.ToTransfer);          // 5 × (25 − 5)
        Assert.Equal(40m, start.SalaryOutstanding);    // all shown until the hand-over credits the netted 25
        Assert.Equal(15m, start.SalaryNotNetted);      // the 3 failed orders' salary: no cash to net against

        await Pay(db, courier, CourierPaymentFlow.CodTransfer, SelectAllCod(await Load(db)));
        Position handed = Sum(await Load(db));
        Show("A) after Select All hand-over", handed);
        Assert.Equal(0m, handed.ToTransfer);
        Assert.Equal(100m, handed.Transfered);
        Assert.Equal(15m, handed.SalaryOutstanding);

        List<Order> failedOrders = (await Load(db)).Where(OrderFinance.IsBillableFailedDelivery).ToList();
        await Pay(db, courier, CourierPaymentFlow.Salary, failedOrders.Select(o => (o.Id, 5m)));
        Position settled = Sum(await Load(db));
        Show("A) after paying the 15 salary in cash", settled);
        ShowCompany(await Load(db));
        Assert.Equal(0m, settled.SalaryOutstanding);
        Assert.Equal(85m, settled.Transfered);         // 100 handed over − 15 salary paid separately = 125 − 40
        Assert.Equal(8m, (await Load(db)).Sum(OrderFinance.CompanyRevenue));   // 5 + 3
        AssertPartition(settled);
    }

    [Fact]
    public async Task Mixed_5RecipientPaid_3DeliveredWithSenderPayingTheFee_AllSalaryNetted()
    {
        string db = $"cod-pos-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        List<Order> day = Enumerable.Range(0, 5).Select(_ => MakeOrder(courier, ServicePayer.Recipient)).ToList();
        day.AddRange(Enumerable.Range(0, 3).Select(_ => MakeOrder(courier, ServicePayer.Sender, cash: 19m)));   // COD only
        await Seed(db, day);

        Position start = Sum(await Load(db));
        Show("B) 5 recipient-pays (cash 25) + 3 delivered, sender pays the fee (cash 19) — before recording", start);
        ShowCompany(await Load(db));
        Assert.Equal(182m, start.Cash);                // 125 + 57
        Assert.Equal(142m, start.ToTransfer);          // 5 × 20 + 3 × 14

        await Pay(db, courier, CourierPaymentFlow.CodTransfer, SelectAllCod(await Load(db)));
        Position settled = Sum(await Load(db));
        Show("B) after Select All hand-over", settled);
        Assert.Equal(0m, settled.ToTransfer);
        Assert.Equal(142m, settled.Transfered);
        Assert.Equal(0m, settled.SalaryOutstanding);
        Assert.Equal(8m, (await Load(db)).Sum(OrderFinance.CompanyRevenue));
        AssertPartition(settled);
    }

    // ── 10. Salary raised after the day was settled ──────────────────────────────────
    [Fact]
    public async Task SalaryRaisedAfterSettlement_ShowsTheExtraAsSalaryStillOwed()
    {
        string db = $"cod-pos-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        await Seed(db, EightOrderDay(courier));
        await Pay(db, courier, CourierPaymentFlow.CodTransfer, SelectAllCod(await Load(db)));
        using (AppDbContext ctx = Ctx(db))
        {
            Order first = await ctx.Orders.OrderBy(o => o.TrackingNumber).FirstAsync();
            first.CourierSalary = 8m;
            await ctx.SaveChangesAsync();
        }

        Position p = Sum(await Load(db));
        Show("after settlement one order's salary is raised 5 → 8", p);

        Assert.Equal(0m, p.ToTransfer);
        Assert.Equal(3m, p.SalaryOutstanding);           // the extra 3 is payable, not silently absorbed
        Assert.Equal(160m, p.Transfered);
        AssertPartition(p);
    }
}
