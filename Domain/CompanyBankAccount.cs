namespace Domain;

/// <summary>
/// One of the company's own bank accounts, managed by an admin from the Bank Accounts page.
/// Surfaced on a customer's Finance invoice export so they know where to pay the company
/// service fee. Exactly one account may have <see cref="IsDefault"/> set once at least one exists.
/// </summary>
public class CompanyBankAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Short admin-chosen name so accounts are distinguishable in the list
    /// (e.g. "Main GEL account", "TBC business"). Optional.</summary>
    public string?  Label             { get; set; }
    public required string BankName          { get; set; }
    public required string AccountHolderName { get; set; }
    public required string AccountNumber     { get; set; }   // IBAN

    public bool     IsDefault { get; set; } = false;
    public DateTime CreatedAt { get; set; } = CustomTime.Now;
}
