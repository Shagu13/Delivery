namespace Application.Customers.DTOs;

/// <summary>One of a customer's saved pickup addresses beyond their main one.</summary>
public sealed record CustomerSecondaryAddressDto(
    Guid   Id,
    string Label,
    string City,
    string District,
    string Address
);
