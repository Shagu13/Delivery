using Application.Settlements.DTOs;
using Application.Settlements.Queries;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// Day summaries must report income as fees − salary (not the payout-timing-dependent net cash)
/// and the transfer to the company as the amount DUE (handed over + outstanding), so they match
/// the admin settlement modal.
/// </summary>
public sealed class CourierSettlementProjectionTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(db).Options);

    private static async Task SeedDelivered(string db, Guid courierId, decimal? transferred)
    {
        using AppDbContext ctx = Ctx(db);
        ctx.Orders.Add(new Order
        {
            TrackingNumber            = $"TN-{Guid.NewGuid():N}"[..12],
            RecipientName             = "Recipient",
            RecipientPhone            = "555111222",
            RecipientCity             = "City",
            RecipientDistrict         = "District",
            RecipientAddress          = "Some street 1",
            OrderType                 = OrderType.Send,
            Status                    = OrderStatus.DeliveredToRecipient,
            CourierId                 = courierId,
            WhoPaysForCompanyService  = ServicePayer.Recipient,
            ProductPaymentStatus      = PaymentStatus.Paid,
            AmountToCollectForPackage = 94m,
            CompanyServicePrice       = 6m,
            CourierSalary             = 4m,
            AmountOfCashCollected     = 100m,
            CodTransferedToCompanyByCourier = transferred,
            DeliveredAt               = CustomTime.Now,
            CreatedAt                 = CustomTime.Now,
        });
        await ctx.SaveChangesAsync();
    }

    private static async Task<CourierSettlementItemDto> Day(string db, Guid courierId)
    {
        using AppDbContext ctx = Ctx(db);
        DateTime from = CustomTime.Today;
        var days = await CourierSettlementProjection.BuildAsync(ctx, courierId, from, from.AddDays(1), CancellationToken.None);
        return Assert.Single(days);
    }

    [Fact]
    public async Task NothingHandedOverYet_TransferIsStillTheAmountDue_AndIncomeIsFeeMinusSalary()
    {
        string db = $"proj-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        await SeedDelivered(db, courier, transferred: null);

        CourierSettlementItemDto day = await Day(db, courier);

        Assert.Equal(96m, day.TotalCourierTransferToCompany);   // 100 cash − 4 salary kept
        Assert.Equal(2m, day.TotalCompanyNetIncome);            // fee 6 − salary 4
    }

    [Fact]
    public async Task AfterHandOver_TransferStaysTheSame_NotTheRemainder()
    {
        string db = $"proj-{Guid.NewGuid()}";
        Guid courier = Guid.NewGuid();
        await SeedDelivered(db, courier, transferred: 96m);

        CourierSettlementItemDto day = await Day(db, courier);

        Assert.Equal(96m, day.TotalCourierTransferToCompany);
        Assert.Equal(2m, day.TotalCompanyNetIncome);
    }
}
