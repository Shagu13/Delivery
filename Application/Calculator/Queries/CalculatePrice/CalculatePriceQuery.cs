using Application.Calculator.DTOs;
using MediatR;

namespace Application.Calculator.Queries.CalculatePrice;

/// <summary>
/// Delivery price for a destination district, as shown by the price calculator.
/// Returns <c>null</c> when the destination district does not exist (the controller maps it to 404).
/// </summary>
/// <param name="CustomerId">
/// The caller's <c>customerId</c> JWT claim, or null for anonymous / non-customer callers.
/// Read from the token by the controller — never from the query string.
/// </param>
public sealed record CalculatePriceQuery(
    Guid  DistrictId,
    Guid? WeightTierId,
    Guid? FromDistrictId,
    Guid? CustomerId) : IRequest<CalculatedPriceDto?>;
