using Domain.Enums;

namespace Domain;

/// <summary>
/// One admin "pay/settle" action against a customer or a courier: a single COD payout,
/// service-fee collection, courier salary payment or courier COD hand-over, covering one
/// or more orders in one atomic click. Order-level payment facts
/// (Order.CodPaidToCustomerAmount/At, ServicePaidByCustomerAmount/At) are overwritten in
/// place and carry no history — this is the persisted record of "on this date we paid/
/// collected $Y across these orders" that both admin and customer can browse by date.
/// </summary>
public class PaymentReceipt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    // Exactly one of CustomerId / CourierId is set, matching Flow.
    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public Guid? CourierId { get; set; }
    public Courier? Courier { get; set; }

    public PaymentReceiptFlow Flow { get; set; }

    // Customer receipts only: false = COD payout (company → customer), true = service fee
    // collected (customer → company). Kept alongside Flow; courier receipts leave it false.
    public bool IsService { get; set; }
    public decimal TotalAmount { get; set; }
    public DateTime PaidAt { get; set; } = CustomTime.Now;

    public ICollection<PaymentReceiptAllocation> Allocations { get; set; } = new List<PaymentReceiptAllocation>();
}

/// <summary>One order's share of a PaymentReceipt.</summary>
public class PaymentReceiptAllocation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PaymentReceiptId { get; set; }
    public PaymentReceipt? PaymentReceipt { get; set; }
    public Guid OrderId { get; set; }
    public Order? Order { get; set; }
    public decimal Amount { get; set; }
}
