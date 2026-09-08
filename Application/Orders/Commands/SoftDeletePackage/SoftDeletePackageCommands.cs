using MediatR;

namespace Application.Orders.Commands.SoftDeletePackage;

/// <summary>
/// Admin soft-deletes a single package from the "Delete Package" page. Stamps
/// <see cref="Domain.Order.DateDeleted"/>; if the order belongs to a batch and no
/// non-deleted sibling remains, the parent <see cref="Domain.GroupOrder"/> is stamped
/// too so the now-empty batch also disappears. Works for standalone Return orders
/// (no batch). Irreversible — there is no restore command.
/// </summary>
public sealed record SoftDeleteOrderCommand(Guid OrderId) : IRequest;

/// <summary>
/// Admin soft-deletes a whole batch from the "Delete Package" page. Stamps
/// <see cref="Domain.GroupOrder.DateDeleted"/> and <see cref="Domain.Order.DateDeleted"/>
/// on every child order. Irreversible — there is no restore command.
/// </summary>
public sealed record SoftDeleteGroupOrderCommand(Guid GroupOrderId) : IRequest;

/// <summary>
/// Admin soft-deletes many packages at once (multi-select on the "Delete Package" page).
/// Each order is stamped; any batch left with no non-deleted child is stamped too. Ids that
/// don't resolve (already deleted / unknown) are reported in <see cref="BulkSoftDeleteResultDto.NotFound"/>
/// rather than failing the whole request. Irreversible.
/// </summary>
public sealed record BulkSoftDeleteOrdersCommand(IReadOnlyList<Guid> OrderIds)
    : IRequest<BulkSoftDeleteResultDto>;

public sealed record BulkSoftDeleteResultDto(
    int DeletedOrders,
    int DeletedBatches,
    IReadOnlyList<Guid> NotFound);
