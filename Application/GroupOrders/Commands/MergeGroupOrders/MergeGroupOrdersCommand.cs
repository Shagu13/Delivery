using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Commands.MergeGroupOrders;

/// <summary>
/// Admin action: merges the chosen source batches into a chosen target batch for one
/// customer. Orders from the sources are moved onto the target, the now-empty source
/// batches and their invoices are deleted, and the target's invoice is recomputed.
/// All batches must belong to the same customer and still be open (not yet picked up).
/// </summary>
public sealed record MergeGroupOrdersCommand(
    Guid TargetGroupOrderId,
    IReadOnlyList<Guid> SourceGroupOrderIds
) : IRequest<CreateGroupOrderResultDto>;
