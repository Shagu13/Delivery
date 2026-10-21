using Application.Finance;
using Domain;
using Domain.Enums;

namespace Application.UnitTests;

/// <summary>
/// The cash a courier still has to hand over exists only for orders that were actually delivered.
/// A postponed (or otherwise undelivered) order has an expected cash figure but nothing collected.
/// </summary>
public sealed class CourierTransferDueTests
{
    private static Order RecipientPaysOrder(OrderStatus status, DateTime? deliveredAt) => new()
    {
        TrackingNumber            = "TN-TRANSFER",
        RecipientName             = "Recipient",
        RecipientPhone            = "555111222",
        RecipientCity             = "City",
        RecipientDistrict         = "District",
        RecipientAddress          = "Some street 1",
        OrderType                 = OrderType.Send,
        Status                    = status,
        WhoPaysForCompanyService  = ServicePayer.Recipient,
        ProductPaymentStatus      = PaymentStatus.NotPaid,
        AmountToCollectForPackage = 94m,
        CompanyServicePrice       = 6m,
        CourierSalary             = 4m,
        DeliveredAt               = deliveredAt,
        CreatedAt                 = CustomTime.Now,
    };

    [Fact]
    public void DeliveredOrder_OwesCashMinusKeptSalary()
    {
        Order o = RecipientPaysOrder(OrderStatus.DeliveredToRecipient, CustomTime.Now);

        Assert.Equal(96m, OrderFinance.CourierCodTransferOutstanding(o));   // 94 + 6 − 4 salary kept
    }

    [Fact]
    public void PostponedOrder_OwesNothing_EvenThoughExpectedCashIsKnown()
    {
        Order o = RecipientPaysOrder(OrderStatus.DeliveryPostponed, deliveredAt: null);

        Assert.Equal(100m, OrderFinance.ExpectedCourierCash(o));            // what the courier WOULD collect
        Assert.Equal(0m, OrderFinance.CourierCodTransferOutstanding(o));    // but nothing is due yet
    }

    [Fact]
    public void ReturnDroppedAtWarehouse_OwesItsCash()
    {
        Order o = RecipientPaysOrder(OrderStatus.DeliveredReturnOrderToWarehouse, deliveredAt: null);
        o.OrderType              = OrderType.Return;
        o.DeliveredToWarehouseAt = CustomTime.Now;

        Assert.Equal(96m, OrderFinance.CourierCodTransferOutstanding(o));
    }
}
