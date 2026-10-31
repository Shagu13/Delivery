using Application.Finance;
using Domain;
using Domain.Enums;

namespace Application.UnitTests;

/// <summary>
/// OrderFinance.CourierPositionOf — the one cash/salary position behind the admin settlement modal and
/// the courier's own settlements page. The company nets ALL salary against the cash the courier holds.
/// </summary>
public sealed class CourierPositionTests
{
    private static Order Delivered(
        ServicePayer payer, decimal cod, decimal fee, decimal salary, decimal cashCollected) => new()
    {
        TrackingNumber            = "TN-POS",
        RecipientName             = "Recipient",
        RecipientPhone            = "555111222",
        RecipientCity             = "City",
        RecipientDistrict         = "District",
        RecipientAddress          = "Some street 1",
        OrderType                 = OrderType.Send,
        Status                    = OrderStatus.DeliveredToRecipient,
        WhoPaysForCompanyService  = payer,
        ProductPaymentStatus      = PaymentStatus.Paid,
        AmountToCollectForPackage = cod,
        CompanyServicePrice       = fee,
        CourierSalary             = salary,
        AmountOfCashCollected     = cashCollected,
        DeliveredAt               = CustomTime.Now,
        CreatedAt                 = CustomTime.Now,
    };

    [Fact]
    public void RecipientPays_CourierKeepsSalary_OwesCashMinusSalary()
    {
        Order o = Delivered(ServicePayer.Recipient, cod: 94m, fee: 6m, salary: 4m, cashCollected: 100m);

        CourierPosition p = OrderFinance.CourierPositionOf(new[] { o });

        Assert.Equal(96m, p.CashStillOwedToCompany);
        Assert.Equal(0m, p.CompanyOwesCourier);
    }

    [Fact]
    public void SenderPays_SalaryIsNettedAgainstCashOnScreen()
    {
        // Cap says the courier owes the full 50 COD, but the company nets the 4 salary against it.
        Order o = Delivered(ServicePayer.Sender, cod: 50m, fee: 6m, salary: 4m, cashCollected: 50m);

        CourierPosition p = OrderFinance.CourierPositionOf(new[] { o });

        Assert.Equal(46m, p.CashStillOwedToCompany);
    }

    [Fact]
    public void SalaryOutweighsCash_CompanyOwesCourier()
    {
        // Sender-pays, no COD: the courier collected nothing but earned 5 — previously floored to 0 and hidden.
        Order o = Delivered(ServicePayer.Sender, cod: 0m, fee: 8m, salary: 5m, cashCollected: 0m);

        CourierPosition p = OrderFinance.CourierPositionOf(new[] { o });

        Assert.Equal(0m, p.CashStillOwedToCompany);
        Assert.Equal(5m, p.CompanyOwesCourier);
    }

    [Fact]
    public void SeparateSalaryPayment_ReducesWhatTheCompanyOwes()
    {
        Order o = Delivered(ServicePayer.Sender, cod: 0m, fee: 8m, salary: 5m, cashCollected: 0m);
        o.CourierSalaryPaidAmount = 5m;

        CourierPosition p = OrderFinance.CourierPositionOf(new[] { o });

        Assert.Equal(0m, p.CompanyOwesCourier);
        Assert.Equal(0m, p.SalaryOutstanding);
    }

    [Fact]
    public void RecordedHandOver_DropsTheRemainingDue()
    {
        Order o = Delivered(ServicePayer.Recipient, cod: 94m, fee: 6m, salary: 4m, cashCollected: 100m);
        o.CodTransferedToCompanyByCourier        = 96m;
        o.IsCourierSalaryIncludedSpecialCase     = true;
        o.CourierSalaryPaidAmount                = 4m;   // kept salary is credited at hand-over

        CourierPosition p = OrderFinance.CourierPositionOf(new[] { o });

        Assert.Equal(0m, p.CashStillOwedToCompany);
        Assert.Equal(96m, p.CashHandedOver);
        Assert.Equal(4m, p.SalaryKeptFromCash);
    }

    [Fact]
    public void SurplusCashOnOneOrder_OffsetsSalaryShortfallOnAnother()
    {
        Order big  = Delivered(ServicePayer.Sender, cod: 50m, fee: 6m, salary: 4m, cashCollected: 50m);
        Order none = Delivered(ServicePayer.Sender, cod: 0m,  fee: 6m, salary: 4m, cashCollected: 0m);

        CourierPosition p = OrderFinance.CourierPositionOf(new[] { big, none });

        Assert.Equal(42m, p.CashStillOwedToCompany);   // 50 − 4 − 4
        Assert.Equal(0m, p.CompanyOwesCourier);
    }
}
