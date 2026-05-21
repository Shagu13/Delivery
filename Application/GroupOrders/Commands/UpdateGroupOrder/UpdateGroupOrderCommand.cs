using MediatR;

namespace Application.GroupOrders.Commands.UpdateGroupOrder;

/// <summary>Admin edits sender and pickup information of a group order at any time.</summary>
public sealed record UpdateGroupOrderCommand(
    Guid    GroupOrderId,
    string  SenderFirstName,
    string  SenderLastName,
    string? SenderIdNumber,
    string  SenderBusinessName,
    string  SenderPhone,
    string  PickUpCity,
    string  PickUpDistrict,
    string  PickUpAddress,
    string? Note
) : IRequest;
