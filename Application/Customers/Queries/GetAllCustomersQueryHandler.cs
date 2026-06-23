using Application.Common.Interfaces;
using Application.Common.Models;
using Application.Customers.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.Queries;

public sealed record GetAllCustomersQuery(
    int    Page     = 1,
    int    PageSize = 20,
    string Search   = "",
    Guid?  TenantId = null   // when set (tenant co-admin), scope to that tenant's customers
) : IRequest<PagedResult<AdminCustomerResponseDto>>;

public sealed class GetAllCustomersQueryHandler
    : IRequestHandler<GetAllCustomersQuery, PagedResult<AdminCustomerResponseDto>>
{
    private readonly IAppDbContext _context;
    public GetAllCustomersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<PagedResult<AdminCustomerResponseDto>> Handle(
        GetAllCustomersQuery request,
        CancellationToken    cancellationToken)
    {
        var query = _context.Customers
            .Include(c => c.ApplicationUser)
            .AsNoTracking();

        // Tenant co-admin: only their own tenant's customers.
        if (request.TenantId is Guid tenantId)
            query = query.Where(c => c.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            query = query.Where(c =>
                c.FirstName.ToLower().Contains(term)           ||
                c.LastName.ToLower().Contains(term)            ||
                c.BusinessName.ToLower().Contains(term)        ||
                c.City.ToLower().Contains(term)                ||
                c.ApplicationUser.Email!.ToLower().Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(c => c.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(c => new AdminCustomerResponseDto(
                c.Id,
                c.FirstName,
                c.LastName,
                c.IdNumber,
                c.BusinessName,
                c.PhoneNumber,
                c.City,
                c.District,
                c.Address,
                c.ApplicationUser.Email!,
                c.IsActive,
                c.CreatedAt,
                c.CompanyServiceCapitalPrice,
                c.CompanyServiceCityPrice,
                c.CompanyServiceDistrictPrice,
                c.IsCompanyServicePriceIncludedInPrice,
                c.TenantId,
                c.Tenant != null ? c.Tenant.DisplayName : null
            ))
            .ToListAsync(cancellationToken);

        return new PagedResult<AdminCustomerResponseDto>(items, total, request.Page, request.PageSize);
    }
}
