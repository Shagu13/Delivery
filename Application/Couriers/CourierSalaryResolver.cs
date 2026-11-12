using Application.Common.Interfaces;
using Application.GroupOrders.Commands.Shared;
using Domain;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers;

/// <summary>
/// Picks a courier's per-zone salary (<see cref="Courier.CapitalSalary"/> /
/// <see cref="Courier.CitySalary"/> / <see cref="Courier.DistrictSalary"/>) for an order's
/// recipient district. The zone comes from the district's <c>IsCapitalTerritory</c> /
/// <c>IsCityTerritory</c> flags — the same split customer pricing uses — and the district is
/// found by (city, name) through <see cref="GroupOrderOrderBuilder.FindDistrict"/>, because
/// district names repeat across cities.
///
/// No fallback between zones: if the courier has no price for the order's zone, or the district
/// is unknown, the result is null and the admin sets that order's salary by hand.
/// Mirrored client-side by <c>client/src/utils/courierSalary.ts</c> — change both together.
/// </summary>
public sealed class CourierSalaryResolver
{
    private readonly IReadOnlyList<District> _districts;
    private readonly IReadOnlyDictionary<Guid, string> _cityNames;

    private CourierSalaryResolver(IReadOnlyList<District> districts, IReadOnlyDictionary<Guid, string> cityNames)
    {
        _districts = districts;
        _cityNames = cityNames;
    }

    /// <summary>
    /// Loads the districts behind the given recipient district names in two queries (districts,
    /// then their city names) — call once before a loop, never per order.
    /// </summary>
    public static async Task<CourierSalaryResolver> LoadAsync(
        IAppDbContext context, IEnumerable<string> districtNames, CancellationToken ct)
    {
        var names = districtNames.Where(n => !string.IsNullOrWhiteSpace(n)).Distinct().ToList();
        if (names.Count == 0)
            return new CourierSalaryResolver(Array.Empty<District>(), new Dictionary<Guid, string>());

        List<District> districts = await context.Districts
            .AsNoTracking()
            .Where(d => d.DateDeleted == null && names.Contains(d.DistrictName))
            .ToListAsync(ct);

        var cityIds = districts.Select(d => d.CityId).Distinct().ToList();
        Dictionary<Guid, string> cityNames = cityIds.Count > 0
            ? await context.Cities
                .AsNoTracking()
                .Where(c => cityIds.Contains(c.Id))
                .ToDictionaryAsync(c => c.Id, c => c.CityName, ct)
            : new Dictionary<Guid, string>();

        return new CourierSalaryResolver(districts, cityNames);
    }

    /// <summary>The courier's salary for delivering to this recipient, or null when none applies.</summary>
    public decimal? SalaryFor(Domain.Courier courier, string recipientCity, string recipientDistrict)
    {
        District? zone = GroupOrderOrderBuilder.FindDistrict(_districts, _cityNames, recipientCity, recipientDistrict);
        return ZoneSalary(courier, zone);
    }

    /// <summary>Pure zone pick — exposed for tests.</summary>
    internal static decimal? ZoneSalary(Domain.Courier courier, District? zone) =>
        zone is null                ? null
        : zone.IsCapitalTerritory   ? courier.CapitalSalary
        : zone.IsCityTerritory      ? courier.CitySalary
                                    : courier.DistrictSalary;
}
