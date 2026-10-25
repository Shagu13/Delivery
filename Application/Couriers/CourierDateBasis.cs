using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers;

/// <summary>Which date a courier's settlement views group their orders by.</summary>
public enum CourierDateBasis
{
    /// <summary>The day the order was delivered (or billably failed) — the original behaviour.</summary>
    Delivered,
    /// <summary>The day the admin assigned the order to the courier (<c>Order.AssignedToCourierAt</c>),
    /// so a batch handed over in one go stays together however many days it takes to deliver.</summary>
    Assigned,
}

/// <summary>
/// The default <see cref="CourierDateBasis"/> per courier. Couriers outside the salary-eligible
/// cities (<see cref="CourierSalaryEligibility"/> — Tbilisi, Rustavi) work regions where daily volume
/// swings from a handful to dozens, so their settlements follow the assignment day; everyone else
/// follows the delivery day. Every settlement read resolves its default here so they cannot drift.
/// </summary>
public static class CourierDateBasisPolicy
{
    public static CourierDateBasis DefaultFor(string assignedCity) =>
        CourierSalaryEligibility.IsEligible(assignedCity) ? CourierDateBasis.Delivered : CourierDateBasis.Assigned;

    /// <summary>The default basis for one courier, read from their <c>AssignedCity</c>.
    /// An unknown courier falls back to <see cref="CourierDateBasis.Delivered"/>.</summary>
    public static async Task<CourierDateBasis> ForCourierAsync(
        IAppDbContext context, Guid courierId, CancellationToken ct)
    {
        string? assignedCity = await context.Couriers
            .AsNoTracking()
            .Where(c => c.Id == courierId)
            .Select(c => c.AssignedCity)
            .FirstOrDefaultAsync(ct);
        return assignedCity is null ? CourierDateBasis.Delivered : DefaultFor(assignedCity);
    }
}

/// <summary>The signed-in courier's own settlement date basis, so their screen can label its day filter.</summary>
public sealed record GetMyCourierDateBasisQuery(Guid CourierId) : IRequest<CourierDateBasis>;

public sealed class GetMyCourierDateBasisQueryHandler
    : IRequestHandler<GetMyCourierDateBasisQuery, CourierDateBasis>
{
    private readonly IAppDbContext _context;
    public GetMyCourierDateBasisQueryHandler(IAppDbContext context) => _context = context;

    public Task<CourierDateBasis> Handle(GetMyCourierDateBasisQuery request, CancellationToken ct) =>
        CourierDateBasisPolicy.ForCourierAsync(_context, request.CourierId, ct);
}
