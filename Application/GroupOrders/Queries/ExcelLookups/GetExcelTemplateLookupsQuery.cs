using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.ExcelLookups;

/// <summary>
/// The reference data behind the downloadable group-order Excel template: active cities (by name)
/// with their active districts (by name) for the dependent city → district dropdowns, and the active
/// weight tiers (by min then max weight) for the optional "Weight tier" column. The workbook itself
/// is built in the API layer.
/// </summary>
public sealed record GetExcelTemplateLookupsQuery : IRequest<ExcelTemplateLookupsDto>;

public sealed record ExcelTemplateLookupsDto(
    IReadOnlyList<TemplateCityDto> Cities,
    IReadOnlyList<TemplateTierDto> Tiers);

public sealed record TemplateCityDto(string CityName, string? CityNameGeo, List<TemplateDistrictDto> Districts);
public sealed record TemplateDistrictDto(string DistrictName, string? DistrictNameGeo, bool IsCapitalTerritory);
public sealed record TemplateTierDto(string? Label, decimal MinWeightKg, decimal MaxWeightKg);

public sealed class GetExcelTemplateLookupsQueryHandler
    : IRequestHandler<GetExcelTemplateLookupsQuery, ExcelTemplateLookupsDto>
{
    private readonly IAppDbContext _context;
    public GetExcelTemplateLookupsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<ExcelTemplateLookupsDto> Handle(GetExcelTemplateLookupsQuery request, CancellationToken ct)
    {
        var cities = await _context.Cities
            .AsNoTracking()
            .Where(c => c.DateDeleted == null)
            .OrderBy(c => c.CityName)
            .Select(c => new TemplateCityDto(
                c.CityName,
                c.CityNameGeo,
                c.Districts
                    .Where(d => d.DateDeleted == null)
                    .OrderBy(d => d.DistrictName)
                    .Select(d => new TemplateDistrictDto(d.DistrictName, d.DistrictNameGeo, d.IsCapitalTerritory))
                    .ToList()))
            .ToListAsync(ct);

        var tiers = await _context.WeightPriceTiers
            .AsNoTracking()
            .Where(t => t.DateDeleted == null)
            .OrderBy(t => t.MinWeightKg).ThenBy(t => t.MaxWeightKg)
            .Select(t => new TemplateTierDto(t.Label, t.MinWeightKg, t.MaxWeightKg))
            .ToListAsync(ct);

        return new ExcelTemplateLookupsDto(cities, tiers);
    }
}
