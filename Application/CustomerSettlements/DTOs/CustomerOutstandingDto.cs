namespace Application.CustomerSettlements.DTOs;

/// <summary>
/// Per-customer outstanding balance summary aggregated across all of a customer's
/// non-deleted batch invoices. Powers the admin finance "who owes whom" overview.
/// At least one of the two amounts is &gt; 0 for every row returned.
/// </summary>
public sealed record CustomerOutstandingDto(
    Guid    CustomerId,
    string  BusinessName,
    string  FirstName,
    string  LastName,
    string  PhoneNumber,
    /// <summary>Company owes the customer: collected COD not yet paid back.</summary>
    decimal OutstandingCodOwedToCustomer,
    /// <summary>Customer owes the company: sender-paid service fees not yet paid.</summary>
    decimal OutstandingServiceOwedToCompany
);
