using Application.Common.Exceptions;
using Application.Finance;
using Application.Orders.Commands.ChangeOrderPayer;
using Application.Orders.Queries.GetOrderPayerChangePreview;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Persistence;

namespace Application.UnitTests;

/// <summary>
/// Admin flips who pays the service fee on a DELIVERED Send order. Every dependent figure must follow, in
/// both directions, and payments that stop being valid are reversed together with their receipts.
/// </summary>
public sealed class OrderPayerChangeTests
{
    private static AppDbContext Ctx(string db) =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(db)
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options);

    private static Order Delivered(ServicePayer payer, decimal fee, decimal? cod, decimal? salary = 4m) => new()
    {
        TrackingNumber            = $"TN-{Guid.NewGuid():N}"[..12],
        RecipientName             = "Recipient",
        RecipientPhone            = "555111222",
        RecipientCity             = "City",
        RecipientDistrict         = "District",
        RecipientAddress          = "Some street 1",
        OrderType                 = OrderType.Send,
        Status                    = OrderStatus.DeliveredToRecipient,
        DeliveredAt               = CustomTime.Now,
        ProductPaymentStatus      = PaymentStatus.Paid,
        WhoPaysForCompanyService  = payer,
        CompanyServicePrice       = fee,
        AmountToCollectForPackage = cod,
        OriginalPackagePrice      = cod,
        CourierSalary             = salary,
        CompanyRevenue            = salary.HasValue ? fee - salary : null,
        AmountOfCashCollected     = payer == ServicePayer.Recipient ? (cod ?? 0m) + fee : cod,
        CompanyServicePaymentStatus = payer == ServicePayer.Recipient
            ? CompanyServicePaymentStatus.Paid
            : CompanyServicePaymentStatus.Unpaid,
    };

    private static ChangeOrderPayerCommandHandler Handler(AppDbContext ctx) => new(ctx);

    // ── Sender → Recipient ───────────────────────────────────────────────────

    [Fact]
    public void SenderToRecipient_CourierNowCollectsTheFeeAtTheDoor()
    {
        Order o = Delivered(ServicePayer.Sender, 6m, 94m);

        PayerChangeComputation r = OrderPayerChangePolicy.Apply(o, ServicePayer.Recipient, 6m);

        Assert.Equal(ServicePayer.Recipient, o.WhoPaysForCompanyService);
        Assert.Equal(100m, o.AmountOfCashCollected);
        Assert.Equal(CompanyServicePaymentStatus.Paid, o.CompanyServicePaymentStatus);
        Assert.Equal(0m, OrderFinance.ServiceOwedBySender(o));
        Assert.Equal(100m, OrderFinance.ExpectedCourierCash(o));
        Assert.Equal(2m, o.CompanyRevenue);
        Assert.Contains(r.Warnings, w => w.Code == "CourierOwesMoreCash" && w.Amount == 6m);
        Assert.Empty(r.ReceiptTrims);
    }

    [Fact]
    public void SenderToRecipient_UndoesFeeNettedOutOfTheCodPayout()
    {
        Order o = Delivered(ServicePayer.Sender, 6m, 94m);
        o.IsCompanyServicePriceIncludedSpecialCase = true;
        o.ServicePaidByCustomerAmount = 6m;
        o.ServicePaidByCustomerAt     = CustomTime.Now;
        o.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
        o.CodPaidToCustomerAmount     = 94m;
        o.CodPaidToCustomerAt         = CustomTime.Now;
        o.IsCollectedCodPaidToCustomer = true;

        PayerChangeComputation r = OrderPayerChangePolicy.Apply(o, ServicePayer.Recipient, 6m);

        Assert.False(o.IsCompanyServicePriceIncludedSpecialCase);
        Assert.Null(o.ServicePaidByCustomerAmount);
        Assert.Equal(88m, o.CodPaidToCustomerAmount);
        Assert.Equal(6m, OrderFinance.CodOwedToCustomer(o)); // the retained fee is owed back
        Assert.Equal(6m, r.ReceiptTrims[PaymentReceiptFlow.CodPayout]);
    }

    [Fact]
    public void SenderToRecipient_SalaryAlreadyPaidSeparately_CourierStillOwesTheWholeFee()
    {
        Order o = Delivered(ServicePayer.Sender, 6m, 94m);
        o.CodTransferedToCompanyByCourier = 94m;
        o.CourierSalaryPaidAmount = 4m;

        OrderPayerChangePolicy.Apply(o, ServicePayer.Recipient, 6m);

        Assert.False(o.IsCourierSalaryIncludedSpecialCase);
        Assert.Equal(94m, o.CodTransferedToCompanyByCourier);
        Assert.Equal(6m, OrderFinance.OutstandingCourierRemittance(o));
    }

    // ── Recipient → Sender ───────────────────────────────────────────────────

    [Fact]
    public void RecipientToSender_SenderOwesTheFee_AndCourierCashIsCapped()
    {
        Order o = Delivered(ServicePayer.Recipient, 6m, 94m);
        o.CodTransferedToCompanyByCourier = 96m; // COD + fee − salary kept
        o.IsCourierSalaryIncludedSpecialCase = true;
        o.CourierSalaryPaidAmount = 4m;

        PayerChangeComputation r = OrderPayerChangePolicy.Apply(o, ServicePayer.Sender, 7m);

        Assert.Equal(94m, o.AmountOfCashCollected);
        Assert.Equal(CompanyServicePaymentStatus.Unpaid, o.CompanyServicePaymentStatus);
        Assert.Equal(7m, OrderFinance.ServiceOwedBySender(o));
        Assert.Equal(94m, o.CodTransferedToCompanyByCourier);
        Assert.Equal(2m, r.ReceiptTrims[PaymentReceiptFlow.CourierCodTransfer]);
        Assert.False(o.IsCourierSalaryIncludedSpecialCase);
        Assert.Equal(3m, o.CompanyRevenue);
    }

    [Fact]
    public void RecipientToSender_KeepsASurchargeThatWasAlreadyPaid_AsPartialPayment()
    {
        Order o = Delivered(ServicePayer.Recipient, 7m, 93m);
        o.CustomerSurcharge = 1m;
        o.ServicePaidByCustomerAmount = 1m;

        OrderPayerChangePolicy.Apply(o, ServicePayer.Sender, 7m);

        Assert.Equal(0m, o.CustomerSurcharge);
        Assert.Equal(1m, o.ServicePaidByCustomerAmount);
        Assert.Equal(CompanyServicePaymentStatus.Pending, o.CompanyServicePaymentStatus);
        Assert.Equal(6m, OrderFinance.ServiceOwedBySender(o));
    }

    [Fact]
    public void AllInOrder_KeepsTheRecipientsGrossConstant()
    {
        Order o = Delivered(ServicePayer.Recipient, 6m, 94m);
        o.IsCompanyServicePriceIncluded = true;

        OrderPayerChangePolicy.Apply(o, ServicePayer.Sender, 8m);
        Assert.Equal(92m, o.AmountToCollectForPackage);

        Order tooBig = Delivered(ServicePayer.Sender, 6m, 5m);
        tooBig.IsCompanyServicePriceIncluded = true;
        Assert.Throws<Application.Common.Exceptions.ValidationException>(
            () => OrderPayerChangePolicy.Apply(tooBig, ServicePayer.Recipient, 20m));
    }

    [Fact]
    public void TenantFeePayment_IsClearedWhenTheSenderStopsOwing()
    {
        Order o = Delivered(ServicePayer.Sender, 6m, 94m);
        o.ServicePaidByTenantAmount = 6m;
        o.ServicePaidByTenantAt = CustomTime.Now;

        PayerChangeComputation r = OrderPayerChangePolicy.Apply(o, ServicePayer.Recipient, 6m);

        Assert.Null(o.ServicePaidByTenantAmount);
        Assert.Contains(r.Warnings, w => w.Code == "TenantServicePaymentReversed");
    }

    // ── Eligibility ──────────────────────────────────────────────────────────

    [Fact]
    public void OnlyDeliveredSendOrders_WithADifferentPayer_AreEligible()
    {
        Order inFlight = Delivered(ServicePayer.Sender, 6m, 94m);
        inFlight.Status = OrderStatus.CourierAssignedToDeliver;
        Assert.Throws<ConflictException>(() => OrderPayerChangePolicy.Apply(inFlight, ServicePayer.Recipient, 6m));

        Order exchange = Delivered(ServicePayer.Sender, 6m, 94m);
        exchange.OrderType = OrderType.Exchange;
        Assert.Throws<ConflictException>(() => OrderPayerChangePolicy.Apply(exchange, ServicePayer.Recipient, 6m));

        Assert.Throws<ConflictException>(
            () => OrderPayerChangePolicy.Apply(Delivered(ServicePayer.Sender, 6m, 94m), ServicePayer.Sender, 6m));
    }

    // ── Handler: persistence + receipts ──────────────────────────────────────

    [Fact]
    public async Task Handler_TrimsServiceFeeReceipts_AndPersistsTheNewState()
    {
        string db = $"payer-change-{Guid.NewGuid()}";
        Guid customerId = Guid.NewGuid();
        Guid orderId;

        using (AppDbContext ctx = Ctx(db))
        {
            Order o = Delivered(ServicePayer.Sender, 6m, 94m);
            o.ServicePaidByCustomerAmount = 6m;
            o.ServicePaidByCustomerAt = CustomTime.Now;
            o.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
            ctx.Orders.Add(o);

            PaymentReceipt receipt = new()
            {
                CustomerId = customerId, Flow = PaymentReceiptFlow.ServiceFee, IsService = true,
                TotalAmount = 6m, PaidAt = CustomTime.Now,
            };
            receipt.Allocations.Add(new PaymentReceiptAllocation { OrderId = o.Id, Amount = 6m });
            ctx.PaymentReceipts.Add(receipt);

            await ctx.SaveChangesAsync();
            orderId = o.Id;
        }

        using (AppDbContext ctx = Ctx(db))
            await Handler(ctx).Handle(
                new ChangeOrderPayerCommand(orderId, ServicePayer.Recipient, 6m), CancellationToken.None);

        using AppDbContext verify = Ctx(db);
        Order saved = await verify.Orders.SingleAsync(o => o.Id == orderId);
        Assert.Equal(ServicePayer.Recipient, saved.WhoPaysForCompanyService);
        Assert.Equal(100m, saved.AmountOfCashCollected);
        Assert.Null(saved.ServicePaidByCustomerAmount);
        Assert.Empty(await verify.PaymentReceipts.ToListAsync());      // emptied receipt removed
        Assert.Empty(await verify.PaymentReceiptAllocations.ToListAsync());
    }

    [Fact]
    public async Task Handler_MissingOrder_Is404()
    {
        using AppDbContext ctx = Ctx($"payer-change-{Guid.NewGuid()}");
        await Assert.ThrowsAsync<NotFoundException>(() =>
            Handler(ctx).Handle(new ChangeOrderPayerCommand(Guid.NewGuid(), ServicePayer.Recipient, 5m), CancellationToken.None));
    }

    // ── Preview: suggested fee follows the creation waterfall ────────────────

    private static async Task<Guid> SeedCustomerOrder(
        string db, decimal districtDefault, decimal? negotiated, decimal? special)
    {
        using AppDbContext ctx = Ctx(db);

        City city = new() { CityName = "Rustavi" };
        District district = new()
        {
            DistrictName = "Center", CityId = city.Id, CompanyServicePrice = districtDefault,
            IsCapitalTerritory = false, IsCityTerritory = false,
        };
        Customer customer = TestSupport.Cust(district: negotiated);
        ctx.Cities.Add(city);
        ctx.Districts.Add(district);
        ctx.Customers.Add(customer);
        if (special is decimal sp)
            ctx.CustomerSpecialPrices.Add(TestSupport.SpecialPrice(customer.Id, district.Id, sp));

        GroupOrder go = new()
        {
            CustomerId = customer.Id, SenderFirstName = "S", SenderLastName = "S", SenderBusinessName = "Biz",
            SenderPhone = "555", PickUpCity = "Rustavi", PickUpDistrict = "Center", PickUpAddress = "Addr",
        };
        Order o = Delivered(ServicePayer.Recipient, 5m, 50m);
        o.RecipientCity = "Rustavi";
        o.RecipientDistrict = "Center";
        o.GroupOrderId = go.Id;
        ctx.GroupOrders.Add(go);
        ctx.Orders.Add(o);
        await ctx.SaveChangesAsync();
        return o.Id;
    }

    [Theory]
    [InlineData(10, 8, 6, 6, OrderFeeSource.CustomerSpecialPrice)]      // special price wins
    [InlineData(10, 8, null, 8, OrderFeeSource.CustomerNegotiatedRate)] // then the negotiated rate
    [InlineData(10, null, null, 10, OrderFeeSource.DistrictDefault)]    // then the district default
    public async Task Preview_SuggestsTheFeeAFreshOrderWouldBeCharged(
        int district, int? negotiated, int? special, int expected, OrderFeeSource source)
    {
        string db = $"payer-preview-{Guid.NewGuid()}";
        Guid orderId = await SeedCustomerOrder(db, district, negotiated, special);

        using AppDbContext ctx = Ctx(db);
        PayerChangePreviewDto dto = await new GetOrderPayerChangePreviewQueryHandler(ctx).Handle(
            new GetOrderPayerChangePreviewQuery(orderId, ServicePayer.Sender, null), CancellationToken.None);

        Assert.Equal((decimal?)expected, dto.SuggestedFee);
        Assert.Equal(source, dto.SuggestedFeeSource);
        Assert.Equal((decimal?)expected, dto.AppliedFee);
        Assert.Contains(dto.Lines, l => l.Field == nameof(Order.WhoPaysForCompanyService) && l.After == "Sender");

        // A preview never writes.
        using AppDbContext verify = Ctx(db);
        Assert.Equal(ServicePayer.Recipient, (await verify.Orders.SingleAsync()).WhoPaysForCompanyService);
    }

    [Fact]
    public async Task Preview_NoPriceAnywhere_AsksTheAdminToEnterOne_ThenUsesIt()
    {
        string db = $"payer-preview-{Guid.NewGuid()}";
        Guid orderId = await SeedCustomerOrder(db, 0m, null, null);

        using AppDbContext ctx = Ctx(db);
        GetOrderPayerChangePreviewQueryHandler handler = new(ctx);

        PayerChangePreviewDto none = await handler.Handle(
            new GetOrderPayerChangePreviewQuery(orderId, ServicePayer.Sender, null), CancellationToken.None);
        Assert.Null(none.SuggestedFee);
        Assert.Equal(OrderFeeSource.None, none.SuggestedFeeSource);
        Assert.Null(none.AppliedFee);
        Assert.Empty(none.Lines);

        PayerChangePreviewDto typed = await handler.Handle(
            new GetOrderPayerChangePreviewQuery(orderId, ServicePayer.Sender, 9m), CancellationToken.None);
        Assert.Equal(9m, typed.AppliedFee);
        Assert.Contains(typed.Lines, l => l.Field == nameof(Order.CompanyServicePrice) && l.After == "9.00");
    }
}
