namespace Domain.Enums;

/// <summary>
/// Describes which financial flow a PaymentRequest record represents.
/// </summary>
public enum PaymentRequestType
{
    /// <summary>
    /// Sender is paying the company their courier service fees.
    /// Relevant when WhoPaysForCompanyService == Sender.
    /// Created by the customer; confirmed by admin.
    /// </summary>
    SenderPaysCompany = 0,

    /// <summary>
    /// Company is forwarding COD product money to the sender.
    /// Relevant when ProductPaymentStatus == NotPaid (courier collected cash from recipient).
    /// Created and confirmed by admin.
    /// </summary>
    CompanyPaysSender = 1,

    /// <summary>
    /// Company is paying a courier their salary for a set of orders/settlement.
    /// Initiated when admin marks WasCourierPaid = true on a DailySettlement.
    /// </summary>
    CompanyPaysCourier = 2,

    /// <summary>
    /// Courier is handing collected cash (COD + service revenue from recipients) to the company.
    /// Tied to a DailySettlement.
    /// </summary>
    CourierHandsOverRevenue = 3,
}
