using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers.Queries.Admin;

/// <summary>
/// Admin/Operator read: every courier (active and soft-deleted), ordered by city then first name,
/// each tagged with the settlement date basis it defaults to (regional couriers: assignment day).
/// </summary>
public sealed record GetCourierRosterQuery : IRequest<IReadOnlyList<CourierRosterDto>>;

public sealed class GetCourierRosterQueryHandler
    : IRequestHandler<GetCourierRosterQuery, IReadOnlyList<CourierRosterDto>>
{
    private readonly IAppDbContext _context;
    public GetCourierRosterQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CourierRosterDto>> Handle(
        GetCourierRosterQuery request, CancellationToken cancellationToken)
    {
        var couriers = await _context.Couriers
            .AsNoTracking()
            .OrderBy(c => c.AssignedCity)
            .ThenBy(c => c.FirstName)
            .Select(c => new
            {
                c.Id,
                c.FirstName,
                c.LastName,
                FullName = $"{c.FirstName} {c.LastName}",
                Username = c.ApplicationUser.UserName,
                c.AssignedCity,
                c.AssignedDistrict,
                c.PhoneNumber,
                c.IdNumber,
                IsDeleted = c.DateDeleted != null,
                c.DateDeleted,
                c.DefaultSalary,
            })
            .ToListAsync(cancellationToken);

        // The date basis is resolved in memory from the rule in CourierDateBasisPolicy,
        // so the client never re-derives it.
        return couriers.Select(c => new CourierRosterDto(
                c.Id, c.FirstName, c.LastName, c.FullName, c.Username,
                c.AssignedCity, c.AssignedDistrict, c.PhoneNumber, c.IdNumber,
                c.IsDeleted, c.DateDeleted, c.DefaultSalary,
                CourierDateBasisPolicy.DefaultFor(c.AssignedCity).ToString()))
            .ToList();
    }
}
