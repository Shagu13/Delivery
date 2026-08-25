namespace Application.Customers.DTOs;

/// <summary>One of a customer's saved bank accounts, for payout lookup. Capped at 5.</summary>
public sealed record CustomerBankAccountDto(
    Guid    Id,
    string? Label,
    string  BankName,
    string  AccountHolderName,
    string  AccountNumber,
    bool    IsDefault
);
