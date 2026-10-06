namespace Domain.Enums;

/// <summary>Which money flow a <see cref="PaymentReceipt"/> records. Persisted by name.</summary>
public enum PaymentReceiptFlow
{
    /// <summary>Company → customer: COD payout.</summary>
    CodPayout = 0,
    /// <summary>Customer → company: service fee collected.</summary>
    ServiceFee = 1,
    /// <summary>Company → courier: salary paid.</summary>
    CourierSalary = 2,
    /// <summary>Courier → company: collected cash handed in.</summary>
    CourierCodTransfer = 3,
}
