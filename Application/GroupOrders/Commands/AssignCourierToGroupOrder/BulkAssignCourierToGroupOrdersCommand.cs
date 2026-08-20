using MediatR;

namespace Application.GroupOrders.Commands.AssignCourierToGroupOrder;

/// <summary>
/// Admin bulk-(re)assigns a pickup courier to many group orders (batches) at once — the
/// pickup-leg mirror of <see cref="Orders.Commands.BulkAssignCourierToOrdersCommand"/>. One DB
/// round trip for the whole selection instead of one request per batch.
/// </summary>
public sealed record BulkAssignCourierToGroupOrdersCommand(
    IReadOnlyList<Guid> GroupOrderIds, Guid CourierId) : IRequest<BulkAssignCourierToGroupOrdersResultDto>;

public sealed record BulkAssignCourierToGroupOrdersResultDto(
    IReadOnlyList<Guid> Succeeded,
    IReadOnlyList<BulkAssignCourierToGroupOrdersFailureDto> Failed);

public sealed record BulkAssignCourierToGroupOrdersFailureDto(Guid GroupOrderId, string Error);
