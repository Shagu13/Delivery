namespace Application.Customers.DTOs;

/// <summary>
/// Full row for the admin "manage special prices" screen — includes display names so the
/// UI can list existing exceptions without a second lookup.
/// </summary>
public sealed record CustomerSpecialPriceDto(
    Guid    Id,
    Guid    DistrictId,
    string  DistrictName,
    string? DistrictNameGeo,
    string  CityName,
    decimal Price
);

/// <summary>
/// Lean (district, price) pair for pricing-preview payloads (customer profile, admin
/// group-order list) — no display names, those come from <see cref="CustomerSpecialPriceDto"/>.
/// </summary>
public sealed record CustomerSpecialPriceLite(Guid DistrictId, decimal Price);
