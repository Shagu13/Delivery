namespace Domain.Enums;

/// <summary>
/// Tracks whether the company's service fee (საკურიერო) has been collected
/// from the sender for a given order (only relevant when WhoPaysForCompanyService == Sender).
/// </summary>
public enum CompanyServicePaymentStatus
{
    /// <summary>No payment request has been submitted yet.</summary>
    Unpaid  = 0,

    /// <summary>Sender has submitted a payment request; awaiting admin confirmation.</summary>
    Pending = 1,

    /// <summary>Admin has confirmed receipt of payment.</summary>
    Paid    = 2,
}
