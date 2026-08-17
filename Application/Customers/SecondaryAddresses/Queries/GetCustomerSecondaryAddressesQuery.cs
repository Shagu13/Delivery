using Application.Common.Interfaces;
using Application.Customers.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.SecondaryAddresses.Queries;

/// <summary>All of a customer's saved pickup addresses beyond their main one.</summary>
public sealed record GetCustomerSecondaryAddressesQuery(Guid CustomerId) : IRequest<List<CustomerSecondaryAddressDto>>;

public sealed class GetCustomerSecondaryAddressesQueryHandler
    : IRequestHandler<GetCustomerSecondaryAddressesQuery, List<CustomerSecondaryAddressDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomerSecondaryAddressesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<List<CustomerSecondaryAddressDto>> Handle(
        GetCustomerSecondaryAddressesQuery request, CancellationToken cancellationToken)
    {
        return await _context.CustomerSecondaryAddresses
            .AsNoTracking()
            .Where(a => a.CustomerId == request.CustomerId)
            .OrderBy(a => a.CreatedAt)
            .Select(a => new CustomerSecondaryAddressDto(a.Id, a.Label, a.City, a.District, a.Address))
            .ToListAsync(cancellationToken);
    }
}
