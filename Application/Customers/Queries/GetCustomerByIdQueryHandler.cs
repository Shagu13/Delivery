using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Customers.DTOs;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.Queries;

// ── GetById ──────────────────────────────────────────────────────────────────

public sealed record GetCustomerByIdQuery(Guid Id) : IRequest<CustomerResponseDto>;

public sealed class GetCustomerByIdQueryHandler
    : IRequestHandler<GetCustomerByIdQuery, CustomerResponseDto>
{
    private readonly IAppDbContext _context;
    public GetCustomerByIdQueryHandler(IAppDbContext context) => _context = context;

    public async Task<CustomerResponseDto> Handle(
        GetCustomerByIdQuery request,
        CancellationToken    cancellationToken)
    {
        var c = await _context.Customers
            .Include(c => c.ApplicationUser)
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.Id, cancellationToken)
            ?? throw new NotFoundException(nameof(Customer), request.Id);

        return CustomerProjection.Project(c);
    }
}

// ── GetByApplicationUserId (drives GET /api/customers/me) ────────────────────

public sealed record GetCustomerByApplicationUserIdQuery(
    string ApplicationUserId
) : IRequest<CustomerResponseDto>;

public sealed class GetCustomerByApplicationUserIdQueryHandler
    : IRequestHandler<GetCustomerByApplicationUserIdQuery, CustomerResponseDto>
{
    private readonly IAppDbContext _context;
    public GetCustomerByApplicationUserIdQueryHandler(IAppDbContext context) => _context = context;

    public async Task<CustomerResponseDto> Handle(
        GetCustomerByApplicationUserIdQuery request,
        CancellationToken                   cancellationToken)
    {
        var c = await _context.Customers
            .Include(c => c.ApplicationUser)
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.ApplicationUserId, cancellationToken)
            ?? throw new NotFoundException(nameof(Customer), request.ApplicationUserId);

        return CustomerProjection.Project(c);
    }
}

// ── Shared projection ────────────────────────────────────────────────────────

internal static class CustomerProjection
{
    internal static CustomerResponseDto Project(Customer c) => new(
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
        c.CompanyServiceDistrictPrice
    );
}
