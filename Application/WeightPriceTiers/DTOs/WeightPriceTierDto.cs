namespace Application.WeightPriceTiers.DTOs;

public sealed record WeightPriceTierDto(
    Guid      Id,
    string?   Label,
    decimal   MinWeightKg,
    decimal   MaxWeightKg,
    decimal?  CapitalPrice,
    decimal?  CityPrice,
    decimal?  DistrictPrice,
    DateTime  CreatedAt
);
