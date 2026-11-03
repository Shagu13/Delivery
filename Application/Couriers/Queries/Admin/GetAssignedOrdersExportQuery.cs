using Application.Common.Interfaces;
using Application.Finance;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers.Queries.Admin;

/// <summary>
/// Admin/Operator read: the rows of one courier's assigned-day Excel manifest — same day rule as
/// <see cref="GetAssignedOrdersForDayQuery"/> (<see cref="AssignedDay"/>), oldest first.
/// <paramref name="GeorgianNames"/> resolves city/district to their Georgian names (the "ka" export).
/// </summary>
public sealed record GetAssignedOrdersExportQuery(DateTime Date, Guid CourierId, bool IncludePrevious, bool GeorgianNames)
    : IRequest<AssignedOrdersExportDto>;

public sealed class GetAssignedOrdersExportQueryHandler
    : IRequestHandler<GetAssignedOrdersExportQuery, AssignedOrdersExportDto>
{
    private readonly IAppDbContext _context;
    public GetAssignedOrdersExportQueryHandler(IAppDbContext context) => _context = context;

    public async Task<AssignedOrdersExportDto> Handle(
        GetAssignedOrdersExportQuery request, CancellationToken ct)
    {
        DateTime day       = request.Date.Date;
        bool     carryOver = AssignedDay.CarriesOver(day, request.IncludePrevious);
        bool     isGeo     = request.GeorgianNames;

        var courierName = await _context.Couriers
            .AsNoTracking()
            .Where(c => c.Id == request.CourierId)
            .Select(c => c.FirstName + " " + c.LastName)
            .FirstOrDefaultAsync(ct);

        var orders = await _context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder)!.ThenInclude(g => g!.Customer)
            .Include(o => o.Customer)
            .Where(o => o.CourierId == request.CourierId)
            .OnAssignedDay(day, carryOver)
            .OrderBy(o => o.CreatedAt)
            .ToListAsync(ct);

        // Small, rarely-changing tables — plain lookups, only loaded for the Georgian export.
        var cityGeo = isGeo
            ? (await _context.Cities.AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(ct))
                .GroupBy(c => c.CityName).ToDictionary(g => g.Key, g => g.First().CityNameGeo)
            : new Dictionary<string, string?>();

        // District names repeat across cities, so key by (city, district name).
        var districtGeo = isGeo
            ? (await _context.Districts.AsNoTracking()
                    .Where(d => d.DateDeleted == null)
                    .Select(d => new { d.DistrictName, City = d.City.CityName, d.DistrictNameGeo })
                    .ToListAsync(ct))
                .GroupBy(d => (d.City, d.DistrictName))
                .ToDictionary(g => g.Key, g => g.First().DistrictNameGeo)
            : new Dictionary<(string, string), string?>();

        var rows = orders.Select(o =>
        {
            var customer = o.GroupOrder?.Customer ?? o.Customer;
            var senderName = customer == null
                ? string.Empty
                : string.IsNullOrWhiteSpace(customer.BusinessName)
                    ? $"{customer.FirstName} {customer.LastName}".Trim()
                    : customer.BusinessName;

            return new AssignedOrderExportRow(
                CreatedAt:           o.CreatedAt,
                SenderName:          senderName,
                City:                isGeo ? (cityGeo.GetValueOrDefault(o.RecipientCity) ?? o.RecipientCity) : o.RecipientCity,
                District:            isGeo ? (districtGeo.GetValueOrDefault((o.RecipientCity, o.RecipientDistrict)) ?? o.RecipientDistrict) : o.RecipientDistrict,
                Address:             o.RecipientAddress,
                RecipientName:       o.RecipientName,
                Description:         o.Description ?? string.Empty,
                Phone:               o.RecipientPhone,
                // Same COD convention as the Packages export: package COD plus, when the
                // recipient pays the company service fee at delivery, that fee too.
                ExpectedCash:        OrderFinance.ExpectedCourierCash(o),
                CompanyServicePrice: o.CompanyServicePrice);
        }).ToList();

        return new AssignedOrdersExportDto(courierName, rows);
    }
}
