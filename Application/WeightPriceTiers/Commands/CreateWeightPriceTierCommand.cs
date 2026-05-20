using Application.WeightPriceTiers.DTOs;
using MediatR;

namespace Application.WeightPriceTiers.Commands;

public sealed record CreateWeightPriceTierCommand(
    string?  Label,
    decimal  MinWeightKg,
    decimal  MaxWeightKg,
    bool     IsStandard,
    decimal? CustomPrice
) : IRequest<WeightPriceTierDto>;
