namespace Domain.Enums;

/// <summary>
/// Lifecycle state of a PaymentRequest.
/// </summary>
public enum PaymentRequestStatus
{
    /// <summary>Submitted / initiated; awaiting confirmation from the other party.</summary>
    Pending          = 0,

    /// <summary>Fully confirmed — all funds received/sent.</summary>
    Confirmed        = 1,

    /// <summary>Partially confirmed — some amount received but not the full total.</summary>
    PartiallyPaid    = 2,
}
