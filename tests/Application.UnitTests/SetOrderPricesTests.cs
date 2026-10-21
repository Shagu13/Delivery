using Application.Orders.Commands;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// The Finance page's price editor sets the service fee and COD together; nothing is re-split
/// behind the admin's back, delivered orders re-derive their recorded cash, and the original
/// package price is frozen once the order is delivered.
/// </summary>
public sealed class SetOrderPricesTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(db).Options);

    private static async Task<Guid> SeedOrder(string db, OrderStatus status, ServicePayer payer,
        decimal fee, decimal? cod, decimal? salary = null)
    {
        using AppDbContext ctx = Ctx(db);
        Order o = new()
        {
            TrackingNumber           = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName            = "Recipient",
            RecipientPhone           = "555111222",
            RecipientCity            = "City",
            RecipientDistrict        = "District",
            RecipientAddress         = "Some street 1",
            OrderType                = OrderType.Send,
            Status                   = status,
            WhoPaysForCompanyService = payer,
            CompanyServicePrice      = fee,
            AmountToCollectForPackage = cod,
            OriginalPackagePrice     = cod,
            CourierSalary            = salary,
            CreatedAt                = CustomTime.Now,
        };
        if (status == OrderStatus.DeliveredToRecipient)
        {
            o.DeliveredAt = CustomTime.Now;
            o.AmountOfCashCollected = payer == ServicePayer.Recipient ? (cod ?? 0m) + fee : cod;
        }
        ctx.Orders.Add(o);
        await ctx.SaveChangesAsync();
        return o.Id;
    }

    private static async Task Set(string db, Guid id, decimal fee, decimal? cod)
    {
        using AppDbContext ctx = Ctx(db);
        await new SetOrderPricesCommandHandler(ctx).Handle(new SetOrderPricesCommand(id, fee, cod), CancellationToken.None);
    }

    [Fact]
    public async Task DeliveredRecipientPays_SetsBothValuesAndRederivesCash_KeepsOriginal()
    {
        string db = $"prices-{Guid.NewGuid()}";
        Guid id = await SeedOrder(db, OrderStatus.DeliveredToRecipient, ServicePayer.Recipient, 6m, 94m, salary: 4m);

        await Set(db, id, 10m, 90m);

        using AppDbContext verify = Ctx(db);
        Order o = await verify.Orders.SingleAsync(x => x.Id == id);
        Assert.Equal(10m, o.CompanyServicePrice);
        Assert.Equal(90m, o.AmountToCollectForPackage);
        Assert.Equal(100m, o.AmountOfCashCollected);
        Assert.Equal(94m, o.OriginalPackagePrice);   // frozen at delivery
        Assert.Equal(6m, o.CompanyRevenue);           // 10 - salary 4
    }

    [Fact]
    public async Task DeliveredRecipientPays_AdminTotalDiffersFromBefore_CashFollowsEnteredValues()
    {
        string db = $"prices-{Guid.NewGuid()}";
        Guid id = await SeedOrder(db, OrderStatus.DeliveredToRecipient, ServicePayer.Recipient, 6m, 94m);

        await Set(db, id, 10m, 94m);

        using AppDbContext verify = Ctx(db);
        Assert.Equal(104m, (await verify.Orders.SingleAsync(x => x.Id == id)).AmountOfCashCollected);
    }

    [Fact]
    public async Task DeliveredSenderPays_CashIsCodOnly()
    {
        string db = $"prices-{Guid.NewGuid()}";
        Guid id = await SeedOrder(db, OrderStatus.DeliveredToRecipient, ServicePayer.Sender, 6m, 94m);

        await Set(db, id, 10m, 90m);

        using AppDbContext verify = Ctx(db);
        Assert.Equal(90m, (await verify.Orders.SingleAsync(x => x.Id == id)).AmountOfCashCollected);
    }

    [Fact]
    public async Task NotDelivered_OriginalFollowsTheEditedCod_CashUntouched()
    {
        string db = $"prices-{Guid.NewGuid()}";
        Guid id = await SeedOrder(db, OrderStatus.CourierAssignedToDeliver, ServicePayer.Recipient, 6m, 94m);

        await Set(db, id, 8m, 92m);

        using AppDbContext verify = Ctx(db);
        Order o = await verify.Orders.SingleAsync(x => x.Id == id);
        Assert.Equal(92m, o.OriginalPackagePrice);
        Assert.Null(o.AmountOfCashCollected);
    }

    [Fact]
    public async Task NullCod_ClearsCod()
    {
        string db = $"prices-{Guid.NewGuid()}";
        Guid id = await SeedOrder(db, OrderStatus.DeliveredToRecipient, ServicePayer.Recipient, 6m, 94m);

        await Set(db, id, 6m, null);

        using AppDbContext verify = Ctx(db);
        Order o = await verify.Orders.SingleAsync(x => x.Id == id);
        Assert.Null(o.AmountToCollectForPackage);
        Assert.Equal(6m, o.AmountOfCashCollected);
    }
}
