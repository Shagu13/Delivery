using Application.Common.Interfaces;
using Application.Customers.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.SpecialPrices.Queries;

/// <summary>All of a customer's per-district price exceptions, for the admin management screen.</summary>
public sealed record GetCustomerSpecialPricesQuery(Guid CustomerId) : IRequest<List<CustomerSpecialPriceDto>>;

public sealed class GetCustomerSpecialPricesQueryHandler
    : IRequestHandler<GetCustomerSpecialPricesQuery, List<CustomerSpecialPriceDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomerSpecialPricesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<List<CustomerSpecialPriceDto>> Handle(
        GetCustomerSpecialPricesQuery request, CancellationToken cancellationToken)
    {
        return await _context.CustomerSpecialPrices
            .AsNoTracking()
            .Where(s => s.CustomerId == request.CustomerId)
            .OrderBy(s => s.District.City.CityName).ThenBy(s => s.District.DistrictName)
            .Select(s => new CustomerSpecialPriceDto(
                s.Id,
                s.DistrictId,
                s.District.DistrictName,
                s.District.DistrictNameGeo,
                s.District.City.CityName,
                s.Price))
            .ToListAsync(cancellationToken);
    }
}
