namespace Application.CompanyBankAccounts.DTOs;

/// <summary>One of the company's own bank accounts, for customer invoices and admin lookup.</summary>
public sealed record CompanyBankAccountDto(
    Guid    Id,
    string? Label,
    string  BankName,
    string  AccountHolderName,
    string  AccountNumber,
    bool    IsDefault
);
