using Application.Common.Interfaces;
using Application.WeightPriceTiers.DTOs;
using Application.WeightPriceTiers.Queries;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.WeightPriceTiers.Queries;

public sealed class GetAllWeightPriceTiersQueryHandler
    : IRequestHandler<GetAllWeightPriceTiersQuery, List<WeightPriceTierDto>>
{
    private readonly IAppDbContext _context;

    public GetAllWeightPriceTiersQueryHandler(IAppDbContext context)
        => _context = context;

    public async Task<List<WeightPriceTierDto>> Handle(
        GetAllWeightPriceTiersQuery request,
        CancellationToken cancellationToken)
    {
        return await _context.WeightPriceTiers
            .AsNoTracking()
            .Where(t => t.DateDeleted == null)
            .OrderBy(t => t.MinWeightKg)
            .Select(t => new WeightPriceTierDto(
                t.Id,
                t.Label,
                t.MinWeightKg,
                t.MaxWeightKg,
                t.CapitalPrice,
                t.CityPrice,
                t.DistrictPrice,
                t.CreatedAt))
            .ToListAsync(cancellationToken);
    }
}
