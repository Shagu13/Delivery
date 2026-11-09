using Application.Common.Interfaces;
using Application.Common.Models;
using Application.Common.Search;
using Application.GroupOrders.DTOs;
using Application.GroupOrders.Queries.GetAllGroupOrders;
using Domain;
using Domain.Enums;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// The Packages-page search was rewritten from one big OR predicate (which SQL Server could
/// only satisfy with a scan) into a UNION ALL of per-column prefix seeks
/// (<see cref="GroupOrderSearch"/>). These tests pin that the rewrite matches exactly the same
/// batches and standalone orders as the old predicate, which is reproduced verbatim below
/// as an in-memory reference.
/// </summary>
public sealed class GroupOrderSearchTests
{
    public static TheoryData<string, string> Cases()
    {
        string[] terms =
        [
            "Nino", "Gela", "Shop", "Vake", "Saburtalo", "Rustaveli", "Pekini",
            "599", "577", "TN-A", "TN-B1", "Tbilisi", "Rustavi", "Ghost", "Zzz",
        ];
        string[] parties = ["sender", "recipient", "any"];
        TheoryData<string, string> data = new();
        foreach (string t in terms)
            foreach (string p in parties)
                data.Add(t, p);
        return data;
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public async Task Search_matches_the_same_rows_as_the_old_predicate(string term, string party)
    {
        using AppDbContext ctx = TestSupport.NewContext();
        Seed(ctx);
        await ctx.SaveChangesAsync();

        HashSet<Guid> expected = OldPredicateIds(ctx, term, party);

        PagedResult<AdminGroupOrderDto> result = await new GetAllGroupOrdersQueryHandler(
                ctx, new NoopCache(), NullLogger<GetAllGroupOrdersQueryHandler>.Instance)
            .Handle(new GetAllGroupOrdersQuery(term, Party: party, PageSize: 500), CancellationToken.None);

        Assert.Equal(expected.OrderBy(x => x), result.Items.Select(i => i.Id).OrderBy(x => x));
        Assert.Equal(expected.Count, result.TotalCount);
    }

    [Fact]
    public async Task Seed_exercises_both_matching_and_non_matching_rows()
    {
        // Guard against the theory passing vacuously (everything empty on both sides).
        using AppDbContext ctx = TestSupport.NewContext();
        Seed(ctx);
        await ctx.SaveChangesAsync();

        Assert.NotEmpty(OldPredicateIds(ctx, "Shop", "sender"));
        Assert.NotEmpty(OldPredicateIds(ctx, "Pekini", "recipient"));
        Assert.Empty(OldPredicateIds(ctx, "Ghost", "recipient")); // only on a soft-deleted order
        Assert.Empty(OldPredicateIds(ctx, "Zzz", "any"));
    }

    // ── The pre-rewrite predicate, evaluated in memory ──────────────────────────────

    private static HashSet<Guid> OldPredicateIds(AppDbContext ctx, string term, string party)
    {
        bool matchesSender    = party != "recipient";
        bool matchesRecipient = party != "sender";
        string[] bn = BusinessNameSearch.Variants(term);

        // The global soft-delete filter applies to go.Orders as well, so ToList() through the
        // DbSets reproduces what the SQL saw.
        List<Order> liveOrders = ctx.Orders.ToList();
        List<Customer> customers = ctx.Customers.ToList();

        IEnumerable<Guid> batches = ctx.GroupOrders.ToList().Where(go =>
        {
            List<Order> children = liveOrders.Where(o => o.GroupOrderId == go.Id).ToList();
            return
                (matchesSender &&
                    (go.SenderFirstName.StartsWith(term) ||
                     go.SenderLastName.StartsWith(term) ||
                     bn.Any(v => go.SenderBusinessName.StartsWith(v)) ||
                     go.SenderPhone.StartsWith(term) ||
                     (go.AlternativeSenderPhone != null && go.AlternativeSenderPhone.StartsWith(term)) ||
                     go.PickUpCity.StartsWith(term) ||
                     go.PickUpDistrict.StartsWith(term) ||
                     go.PickUpAddress.StartsWith(term)))
                ||
                (matchesRecipient &&
                    children.Any(o =>
                        o.RecipientName.StartsWith(term) ||
                        o.RecipientPhone.StartsWith(term) ||
                        o.RecipientCity.StartsWith(term) ||
                        o.RecipientDistrict.StartsWith(term) ||
                        o.RecipientAddress.StartsWith(term)))
                ||
                children.Any(o => o.TrackingNumber.StartsWith(term));
        }).Select(go => go.Id);

        OrderStatus[] cancelled = [OrderStatus.CancelledByAdmin, OrderStatus.CancelledBySender, OrderStatus.OrderNotAccepted];
        IEnumerable<Guid> standalone = liveOrders
            .Where(o => o.GroupOrderId == null && o.CustomerId != null && !cancelled.Contains(o.Status))
            .Where(o =>
            {
                Customer? c = customers.FirstOrDefault(x => x.Id == o.CustomerId);
                return
                    (matchesRecipient &&
                        (o.RecipientName.StartsWith(term) ||
                         o.RecipientPhone.StartsWith(term) ||
                         o.RecipientCity.StartsWith(term) ||
                         o.RecipientDistrict.StartsWith(term) ||
                         o.RecipientAddress.StartsWith(term)))
                    ||
                    (matchesSender && c != null &&
                        (bn.Any(v => c.BusinessName.StartsWith(v)) ||
                         c.FirstName.StartsWith(term) ||
                         c.LastName.StartsWith(term) ||
                         c.PhoneNumber.StartsWith(term) ||
                         c.City.StartsWith(term) ||
                         c.District.StartsWith(term) ||
                         c.Address.StartsWith(term)))
                    ||
                    o.TrackingNumber.StartsWith(term);
            })
            .Select(o => o.Id);

        return batches.Concat(standalone).ToHashSet();
    }

    // ── Data ────────────────────────────────────────────────────────────────────────

    private static void Seed(AppDbContext ctx)
    {
        Customer quotedShop = AddCustomer(ctx, "Nino", "Beridze", "\"Shop One\"", "599100100", "Tbilisi", "Vake", "Chavchavadze 1");
        Customer plainShop  = AddCustomer(ctx, "Gela", "Kapanadze", "Shopline",   "577200200", "Rustavi", "Old Rustavi", "Megobroba 5");
        Customer other      = AddCustomer(ctx, "Ana",  "Lomidze",   "«Market»",   "555300300", "Batumi", "Center", "Gorgiladze 9");

        GroupOrder b1 = AddBatch(ctx, quotedShop, alternativePhone: null);
        AddOrder(ctx, b1.Id, null, "TN-A0001", "Levan", "568111111", "Tbilisi", "Saburtalo", "Pekini 10");
        AddOrder(ctx, b1.Id, null, "TN-A0002", "Mari",  "568222222", "Tbilisi", "Vake",      "Abashidze 3");

        GroupOrder b2 = AddBatch(ctx, plainShop, alternativePhone: "599999999");
        AddOrder(ctx, b2.Id, null, "TN-B1001", "Dato", "551000000", "Kutaisi", "Center", "Rustaveli 4");
        // Soft-deleted child: must not make its batch match on recipient fields or TN.
        Order ghost = AddOrder(ctx, b2.Id, null, "TN-G0001", "Ghost", "500000000", "Ghostown", "Ghostdistrict", "Ghost st");
        ghost.DateDeleted = CustomTime.Now;

        GroupOrder b3 = AddBatch(ctx, other, alternativePhone: null);
        AddOrder(ctx, b3.Id, null, "TN-C0001", "Nino", "577777777", "Batumi", "Center", "Rustaveli 99");

        // Standalone orders (no batch): one live Return per customer, plus a cancelled one
        // the base query always excludes, plus an account-less one (no CustomerId).
        AddOrder(ctx, null, quotedShop.Id, "TN-A9001", "Tamar", "599555555", "Tbilisi", "Saburtalo", "Vazha 7", OrderType.Return);
        AddOrder(ctx, null, plainShop.Id,  "TN-B9001", "Shota", "511111111", "Rustavi", "New Rustavi", "Pekini 2", OrderType.Return);
        AddOrder(ctx, null, other.Id,      "TN-B9002", "Gela",  "522222222", "Tbilisi", "Vake", "Rustaveli 1", OrderType.Return,
                 OrderStatus.CancelledByAdmin);
        AddOrder(ctx, null, null,          "TN-A9003", "Nino",  "599000000", "Tbilisi", "Vake", "Pekini 1", OrderType.Return);
    }

    private static Customer AddCustomer(AppDbContext ctx, string first, string last, string business,
        string phone, string city, string district, string address)
    {
        Customer c = new()
        {
            FirstName = first, LastName = last, BusinessName = business, PhoneNumber = phone,
            City = city, District = district, Address = address, ApplicationUserId = $"u-{phone}",
        };
        ctx.Customers.Add(c);
        return c;
    }

    private static GroupOrder AddBatch(AppDbContext ctx, Customer c, string? alternativePhone)
    {
        GroupOrder go = new()
        {
            CustomerId = c.Id,
            SenderFirstName = c.FirstName, SenderLastName = c.LastName, SenderBusinessName = c.BusinessName,
            SenderPhone = c.PhoneNumber, AlternativeSenderPhone = alternativePhone,
            PickUpCity = c.City, PickUpDistrict = c.District, PickUpAddress = c.Address,
            NumberOfPackages = 0,
        };
        ctx.GroupOrders.Add(go);
        return go;
    }

    private static Order AddOrder(AppDbContext ctx, Guid? groupOrderId, Guid? customerId, string tn,
        string name, string phone, string city, string district, string address,
        OrderType type = OrderType.Send, OrderStatus status = OrderStatus.Pending)
    {
        Order o = new()
        {
            GroupOrderId = groupOrderId, CustomerId = customerId, TrackingNumber = tn,
            RecipientName = name, RecipientPhone = phone, RecipientCity = city,
            RecipientDistrict = district, RecipientAddress = address,
            OrderType = type, Status = status, CreatedAt = CustomTime.Now,
        };
        ctx.Orders.Add(o);
        return o;
    }

    private sealed class NoopCache : ICacheService
    {
        public Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default) => Task.FromResult<T?>(default);
        public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task RemoveAsync(string key, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
