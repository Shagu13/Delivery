using Application.CustomerSettlements.Queries;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// Finance/settlement lines show where the courier collected a Return (ReturnPickup*, the recipient's address),
/// not its Recipient* fields (the sender/business it goes back to). Send orders keep the recipient address.
/// Goes through a real handler so the slim <c>LineFields</c> projection is covered too.
/// </summary>
public sealed class ReturnSettlementAddressTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(db).Options);

    private static Order Make(Guid courierId, OrderType type) => new()
    {
        TrackingNumber            = $"TN-{Guid.NewGuid():N}"[..12],
        RecipientName             = "Name",
        RecipientPhone            = "555111222",
        RecipientCity             = "Business City",
        RecipientDistrict         = "Business District",
        RecipientAddress          = "Business street 1",
        OrderType                 = type,
        Status                    = type == OrderType.Return ? OrderStatus.DeliveredReturnOrderToWarehouse : OrderStatus.DeliveredToRecipient,
        WhoPaysForCompanyService  = ServicePayer.Sender,
        ProductPaymentStatus      = PaymentStatus.Paid,
        CompanyServicePrice       = 9m,
        CourierSalary             = 4m,
        CourierId                 = courierId,
        AssignedToCourierAt       = CustomTime.Now.AddDays(-1),
        DeliveredAt               = type == OrderType.Return ? null : CustomTime.Now,
        DeliveredToWarehouseAt    = type == OrderType.Return ? CustomTime.Now : null,
        CreatedAt                 = CustomTime.Now,
    };

    [Fact]
    public async Task ReturnLine_ShowsPickupAddress_SendLine_ShowsRecipientAddress()
    {
        string db = $"return-address-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        Guid returnId, sendId;

        using (AppDbContext ctx = Ctx(db))
        {
            Order ret = Make(courier, OrderType.Return);
            ret.ReturnPickupCity     = "Pickup City";
            ret.ReturnPickupDistrict = "Pickup District";
            ret.ReturnPickupAddress  = "Pickup street 7";
            Order send = Make(courier, OrderType.Send);

            ctx.Orders.AddRange(ret, send);
            await ctx.SaveChangesAsync();
            returnId = ret.Id;
            sendId   = send.Id;
        }

        using AppDbContext read = Ctx(db);
        var lines = await new GetCourierOrderFinanceLinesQueryHandler(read).Handle(
            new GetCourierOrderFinanceLinesQuery(courier, Date: null, OnlyUnsettled: true), CancellationToken.None);

        var r = Assert.Single(lines, l => l.OrderId == returnId);
        Assert.Equal("Pickup City",     r.RecipientCity);
        Assert.Equal("Pickup District", r.RecipientDistrict);
        Assert.Equal("Pickup street 7", r.RecipientAddress);

        var s = Assert.Single(lines, l => l.OrderId == sendId);
        Assert.Equal("Business City",     s.RecipientCity);
        Assert.Equal("Business District", s.RecipientDistrict);
        Assert.Equal("Business street 1", s.RecipientAddress);
    }
}
