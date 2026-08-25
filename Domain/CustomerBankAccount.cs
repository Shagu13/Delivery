namespace Domain;

/// <summary>
/// One of a customer's saved bank accounts, self-managed from their profile so an admin has
/// somewhere to look up payout details when settling COD/service payments. Capped at 5 per
/// customer — see AddCustomerBankAccountCommand. Exactly one account per customer may have
/// <see cref="IsDefault"/> set once at least one exists.
/// </summary>
public class CustomerBankAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid     CustomerId { get; set; }
    public Customer Customer   { get; set; } = null!;

    /// <summary>Short customer-chosen name so saved accounts are distinguishable in the list
    /// (e.g. "Main account", "TBC business"). Optional.</summary>
    public string?  Label             { get; set; }
    public required string BankName          { get; set; }
    public required string AccountHolderName { get; set; }
    public required string AccountNumber     { get; set; }   // IBAN

    public bool     IsDefault { get; set; } = false;
    public DateTime CreatedAt { get; set; } = CustomTime.Now;
}
