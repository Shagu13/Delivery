using Application.Common.Exceptions;
using Application.Common.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands;

/// <summary>
/// A courier takes warehouse parcels for themselves (scan-to-claim). Only parcels that are still
/// unassigned per <see cref="UnassignedOrderPolicy"/> are taken — a courier can never grab a parcel
/// another courier already holds. The courier is resolved from the caller's user id, never the body.
/// </summary>
public sealed record CourierClaimOrdersCommand(IReadOnlyList<Guid> OrderIds, string CourierUserId)
    : IRequest<BulkAssignCourierResultDto>;

public sealed class CourierClaimOrdersCommandValidator : AbstractValidator<CourierClaimOrdersCommand>
{
    public CourierClaimOrdersCommandValidator()
    {
        RuleFor(x => x.OrderIds).NotEmpty().Must(ids => ids.Count <= 200)
            .WithMessage("Claim at most 200 parcels at a time.");
        RuleForEach(x => x.OrderIds).NotEmpty();
        RuleFor(x => x.CourierUserId).NotEmpty();
    }
}

// Validates the whole batch against the policy in ONE query, then hands the claimable ids to the
// existing bulk assignment so salary auto-fill, the delivery window, realtime pings and the
// recipient SMS all behave exactly as when an admin assigns.
public sealed class CourierClaimOrdersCommandHandler
    : IRequestHandler<CourierClaimOrdersCommand, BulkAssignCourierResultDto>
{
    private readonly IAppDbContext _context;
    private readonly ISender _sender;

    public CourierClaimOrdersCommandHandler(IAppDbContext context, ISender sender)
    {
        _context = context;
        _sender = sender;
    }

    public async Task<BulkAssignCourierResultDto> Handle(
        CourierClaimOrdersCommand request, CancellationToken cancellationToken)
    {
        Domain.Courier courier = await _context.Couriers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CourierUserId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierUserId);

        List<Guid> requestedIds = request.OrderIds.Distinct().ToList();

        List<Domain.Order> orders = await _context.Orders
            .AsNoTracking()
            .Where(o => requestedIds.Contains(o.Id))
            .ToListAsync(cancellationToken);

        List<BulkAssignFailureDto> failed = new();
        List<Guid> claimable = new();

        HashSet<Guid> foundIds = orders.Select(o => o.Id).ToHashSet();
        foreach (Guid missingId in requestedIds.Where(id => !foundIds.Contains(id)))
            failed.Add(new BulkAssignFailureDto(missingId, "Order not found."));

        foreach (Domain.Order order in orders)
        {
            string? rejection = UnassignedOrderPolicy.Rejection(order);
            if (rejection is null) claimable.Add(order.Id);
            else failed.Add(new BulkAssignFailureDto(order.Id, rejection));
        }

        if (claimable.Count == 0)
            return new BulkAssignCourierResultDto(new List<Guid>(), failed);

        BulkAssignCourierResultDto assigned = await _sender.Send(
            new BulkAssignCourierToOrdersCommand(claimable, courier.Id), cancellationToken);

        return new BulkAssignCourierResultDto(assigned.Succeeded, failed.Concat(assigned.Failed).ToList());
    }
}
