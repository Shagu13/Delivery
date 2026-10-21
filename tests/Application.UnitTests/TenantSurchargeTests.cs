using Application.Common.Exceptions;
using Application.TenantSettlements;
using Application.TenantSettlements.Commands;
using Application.TenantSettlements.Queries;
using Application.Tenants.Queries;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// The dilo ↔ tenant tier must treat a customer surcharge exactly like the company ↔ customer tier:
/// the tenant owes dilo the whole fee on sender-pays orders, only the surcharge on a recipient-pays
/// order that carries one, and nothing on an ordinary recipient-pays order.
/// </summary>
public sealed class TenantSurchargeTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(db).Options);

    private sealed record Seeded(Guid TenantId, Guid SenderOrder, Guid SurchargeOrder, Guid OrdinaryOrder);

    private static Order Delivered(Guid customerId, ServicePayer payer, decimal fee, decimal surcharge, string tn) => new()
    {
        TrackingNumber            = tn,
        RecipientName             = "Recipient",
        RecipientPhone            = "555111222",
        RecipientCity             = "City",
        RecipientDistrict         = "District",
        RecipientAddress          = "Some street 1",
        OrderType                 = OrderType.Send,
        Status                    = OrderStatus.DeliveredToRecipient,
        CustomerId                = customerId,
        WhoPaysForCompanyService  = payer,
        CompanyServicePrice       = fee,
        CustomerSurcharge         = surcharge,
        AmountToCollectForPackage = 94m,
        DeliveredAt               = CustomTime.Now,
        CreatedAt                 = CustomTime.Now,
    };

    private static async Task<Seeded> Seed(string db)
    {
        using AppDbContext ctx = Ctx(db);
        Tenant tenant = new() { Host = $"t-{Guid.NewGuid():N}.test", DisplayName = "Tenant" };
        Customer customer = new()
        {
            FirstName = "A", LastName = "B", BusinessName = "Shop", PhoneNumber = "555000111",
            City = "City", District = "District", Address = "Addr", TenantId = tenant.Id,
        };
        Order sender    = Delivered(customer.Id, ServicePayer.Sender,    fee: 5m, surcharge: 0m, "TN-SENDER");
        Order surcharge = Delivered(customer.Id, ServicePayer.Recipient, fee: 7m, surcharge: 1m, "TN-SURCH");
        Order ordinary  = Delivered(customer.Id, ServicePayer.Recipient, fee: 6m, surcharge: 0m, "TN-ORD");
        ctx.Tenants.Add(tenant);
        ctx.Customers.Add(customer);
        ctx.Orders.AddRange(sender, surcharge, ordinary);
        await ctx.SaveChangesAsync();
        return new Seeded(tenant.Id, sender.Id, surcharge.Id, ordinary.Id);
    }

    [Fact]
    public async Task SettlementSheet_TenantOwesWholeSenderFeesPlusSurcharges_NotOrdinaryRecipientFees()
    {
        string db = $"tenant-sheet-{Guid.NewGuid()}";
        Seeded s = await Seed(db);

        using AppDbContext ctx = Ctx(db);
        TenantSettlementOrdersResult result = await new GetTenantSettlementOrdersQueryHandler(ctx).Handle(
            new GetTenantSettlementOrdersQuery(s.TenantId, null, false), CancellationToken.None);

        Assert.Equal(5m + 1m, result.TotalService);   // sender fee 5 + surcharge 1; the ordinary 6 is collected by the courier
        Assert.Equal(0m, result.Orders.Single(o => o.OrderId == s.OrdinaryOrder).ServiceOwed);
        Assert.Equal(1m, result.Orders.Single(o => o.OrderId == s.SurchargeOrder).ServiceOwed);
        Assert.Equal(5m, result.Orders.Single(o => o.OrderId == s.SenderOrder).ServiceOwed);
    }

    [Fact]
    public async Task RecordingServicePayment_OnSurchargeOrder_DefaultsToTheSurcharge()
    {
        string db = $"tenant-pay-{Guid.NewGuid()}";
        Seeded s = await Seed(db);

        using (AppDbContext ctx = Ctx(db))
            await new RecordTenantOrderPaymentCommandHandler(ctx).Handle(
                new RecordTenantOrderPaymentCommand(s.TenantId, s.SurchargeOrder, null, null, null, true),
                CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Assert.Equal(1m, (await verify.Orders.SingleAsync(o => o.Id == s.SurchargeOrder)).ServicePaidByTenantAmount);
    }

    [Fact]
    public async Task RecordingServicePayment_OnOrdinaryRecipientPaysOrder_StillRejected()
    {
        string db = $"tenant-pay-none-{Guid.NewGuid()}";
        Seeded s = await Seed(db);

        using AppDbContext ctx = Ctx(db);
        await Assert.ThrowsAsync<ConflictException>(() => new RecordTenantOrderPaymentCommandHandler(ctx).Handle(
            new RecordTenantOrderPaymentCommand(s.TenantId, s.OrdinaryOrder, null, null, null, true),
            CancellationToken.None));
    }

    [Fact]
    public async Task Overview_TenantOwesCompanyAndCustomersOweTenant_IncludeTheSurcharge()
    {
        string db = $"tenant-overview-{Guid.NewGuid()}";
        Seeded s = await Seed(db);

        using AppDbContext ctx = Ctx(db);
        TenantFinanceOverviewDto dto = await new GetTenantFinanceOverviewQueryHandler(ctx).Handle(
            new GetTenantFinanceOverviewQuery(s.TenantId), CancellationToken.None);

        Assert.Equal(6m, dto.GrossServiceSenderPays);   // 5 sender fee + 1 surcharge
        Assert.Equal(6m, dto.TenantOwesCompany);
        Assert.Equal(6m, dto.CustomersOweTenant);
    }

    [Fact]
    public async Task MonthlySettlement_ServiceOwedByTenant_IncludesTheSurcharge()
    {
        string db = $"tenant-month-{Guid.NewGuid()}";
        Seeded s = await Seed(db);

        using AppDbContext ctx = Ctx(db);
        TenantSettlement row = await TenantSettlementService.EnsureAndRecomputeAsync(
            ctx, s.TenantId, CustomTime.Now.Year, CustomTime.Now.Month, CancellationToken.None);

        Assert.Equal(6m, row.TotalCompanyServicePriceOwedByTenant);
    }
}
