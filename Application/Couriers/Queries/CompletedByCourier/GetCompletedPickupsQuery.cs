using Application.Common.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers.Queries.CompletedByCourier;

/// <summary>
/// Admin read: pickup batches a courier brought to the warehouse between two Georgian days (inclusive),
/// dated by <c>GroupOrder.DeliveredToWarehouseAt</c>. <paramref name="CourierId"/> null = every courier.
/// </summary>
public sealed record GetCompletedPickupsQuery(Guid? CourierId, DateTime From, DateTime To)
    : IRequest<IReadOnlyList<CompletedPickupDto>>;

public sealed class GetCompletedPickupsQueryValidator : AbstractValidator<GetCompletedPickupsQuery>
{
    public GetCompletedPickupsQueryValidator()
    {
        RuleFor(x => x.To).GreaterThanOrEqualTo(x => x.From);
        RuleFor(x => x).Must(x => (x.To.Date - x.From.Date).TotalDays < CompletedRange.MaxDays)
            .WithMessage($"The date range may not exceed {CompletedRange.MaxDays} days.");
    }
}

public sealed class GetCompletedPickupsQueryHandler
    : IRequestHandler<GetCompletedPickupsQuery, IReadOnlyList<CompletedPickupDto>>
{
    private readonly IAppDbContext _context;
    public GetCompletedPickupsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CompletedPickupDto>> Handle(
        GetCompletedPickupsQuery request, CancellationToken cancellationToken)
    {
        DateTime from = request.From.Date;
        DateTime to   = request.To.Date.AddDays(1);

        IQueryable<Domain.GroupOrder> query = _context.GroupOrders
            .AsNoTracking()
            .Where(g => g.CourierId != null && g.DeliveredToWarehouseAt >= from && g.DeliveredToWarehouseAt < to);

        if (request.CourierId is Guid courierId)
            query = query.Where(g => g.CourierId == courierId);

        return await query
            .OrderByDescending(g => g.DeliveredToWarehouseAt)
            .Select(g => new CompletedPickupDto(
                g.Id,
                g.CourierId!.Value,
                g.Courier == null ? string.Empty : g.Courier.FirstName + " " + g.Courier.LastName,
                g.SenderBusinessName,
                g.SenderPhone,
                g.PickUpCity,
                g.PickUpDistrict,
                g.PickUpAddress,
                g.NumberOfPackages,
                g.Status.ToString(),
                g.PickedUpAt,
                g.DeliveredToWarehouseAt!.Value))
            .ToListAsync(cancellationToken);
    }
}
