namespace Domain.Enums;

/// <summary>
/// Whether the product payment has been collected from the recipient.
/// Replaces the former boolean IsPaid on Order.
/// </summary>
public enum PaymentStatus
{
    NotPaid = 0,
    Paid    = 1,
}
