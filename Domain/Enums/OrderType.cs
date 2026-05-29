namespace Domain.Enums;

/// <summary>
/// The type of service for a single Order (package) within a GroupOrder.
/// Default is Send (standard delivery).
/// Return  — courier picks up from recipient's address and brings to warehouse;
///           admin then assigns courier to deliver back to sender.
/// Exchange — sent to the same or different recipient; operationally identical to Send,
///           labelled separately for reporting and status tracking.
/// </summary>
public enum OrderType
{
    Send     = 0,
    Return   = 1,
    Exchange = 2,
}
