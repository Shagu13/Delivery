using Application.Cities;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.ExcelLookups;

/// <summary>
/// The reference data the group-order Excel import needs to read a filled-in template back:
/// Georgian → English city/district names (cells may hold either) and the active weight tiers
/// (the API layer indexes them by their display label to map a picked cell back to a tier id).
/// </summary>
public sealed record GetExcelImportLookupsQuery : IRequest<ExcelImportLookupsDto>;

public sealed record ExcelImportLookupsDto(
    Dictionary<string, string> CityGeoToEn,
    Dictionary<string, string> DistrictGeoToEn,
    IReadOnlyList<ImportTierDto> Tiers);

public sealed record ImportTierDto(Guid Id, string? Label, decimal MinWeightKg, decimal MaxWeightKg);

public sealed class GetExcelImportLookupsQueryHandler
    : IRequestHandler<GetExcelImportLookupsQuery, ExcelImportLookupsDto>
{
    private readonly IAppDbContext _context;
    public GetExcelImportLookupsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<ExcelImportLookupsDto> Handle(GetExcelImportLookupsQuery request, CancellationToken ct)
    {
        GeoNameMaps names = await GeoNameMaps.LoadAsync(_context, ct);

        var tiers = await _context.WeightPriceTiers
            .AsNoTracking()
            .Where(t => t.DateDeleted == null)
            .Select(t => new ImportTierDto(t.Id, t.Label, t.MinWeightKg, t.MaxWeightKg))
            .ToListAsync(ct);

        return new ExcelImportLookupsDto(names.CityGeoToEn, names.DistrictGeoToEn, tiers);
    }
}
