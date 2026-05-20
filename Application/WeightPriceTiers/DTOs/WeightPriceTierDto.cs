namespace Application.WeightPriceTiers.DTOs;

public sealed record WeightPriceTierDto(
    Guid      Id,
    string?   Label,
    decimal   MinWeightKg,
    decimal   MaxWeightKg,
    bool      IsStandard,
    decimal?  CustomPrice,
    DateTime  CreatedAt
);
