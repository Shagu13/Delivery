using Application.PartnerOrders.DTOs;
using MediatR;

namespace Application.PartnerOrders.Queries.GetPartnerOrder;

/// <summary>
/// Fetches one of the partner's orders by <paramref name="Reference"/>, which may be
/// either this system's tracking number or the partner's own ExternalReference.
/// Scoped to the partner so they can never read another customer's order.
/// </summary>
public sealed record GetPartnerOrderQuery(
    Guid CustomerId,
    string Reference
) : IRequest<PartnerOrderDetailDto>;
