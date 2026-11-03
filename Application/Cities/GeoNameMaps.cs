using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities;

/// <summary>
/// Georgian display name → English canonical name, for active cities and districts. Used wherever
/// user/partner input may name a place in either language (Excel import, Partner API intake) and must
/// be stored under the English name. Names without a Georgian translation are simply absent — callers
/// fall back to the input as typed. Keys compare ordinally (Georgian has no case).
/// </summary>
internal sealed record GeoNameMaps(Dictionary<string, string> CityGeoToEn, Dictionary<string, string> DistrictGeoToEn)
{
    public static async Task<GeoNameMaps> LoadAsync(IAppDbContext db, CancellationToken ct)
    {
        var cities = await db.Cities.AsNoTracking()
            .Where(c => c.DateDeleted == null)
            .Select(c => new { c.CityName, c.CityNameGeo })
            .ToListAsync(ct);

        var cityGeoToEn = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var c in cities)
            if (!string.IsNullOrWhiteSpace(c.CityNameGeo))
                cityGeoToEn[c.CityNameGeo!] = c.CityName;

        var districts = await db.Districts.AsNoTracking()
            .Where(d => d.DateDeleted == null)
            .Select(d => new { d.DistrictName, d.DistrictNameGeo })
            .ToListAsync(ct);

        var districtGeoToEn = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var d in districts)
            if (!string.IsNullOrWhiteSpace(d.DistrictNameGeo))
                districtGeoToEn[d.DistrictNameGeo!] = d.DistrictName;

        return new GeoNameMaps(cityGeoToEn, districtGeoToEn);
    }
}
