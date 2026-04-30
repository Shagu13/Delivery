namespace Domain.Enums;

/// <summary>
/// Indicates which party is responsible for paying the company's courier service fee
/// (საკურიერო მომსახურება) for a given Order.
/// </summary>
public enum ServicePayer
{
    Sender    = 0,
    Recipient = 1,
}
