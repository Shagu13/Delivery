using Application.WeightPriceTiers.DTOs;
using MediatR;

namespace Application.WeightPriceTiers.Queries;

/// <summary>Returns all active (non-deleted) weight price tiers, ordered by MinWeightKg.</summary>
public sealed record GetAllWeightPriceTiersQuery : IRequest<List<WeightPriceTierDto>>;
