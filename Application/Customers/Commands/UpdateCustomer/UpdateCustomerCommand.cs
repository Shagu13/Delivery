using Application.Common.Exceptions;
using Application.Common.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.Commands.UpdateCustomer;

// ── DTO ───────────────────────────────────────────────────────────────────────

public sealed record UpdateCustomerDto(
    string  FirstName,
    string  LastName,
    string? IdNumber,
    string  BusinessName,
    string  PhoneNumber,
    string  City,
    string  District,
    string  Address,
    /// <summary>Exact pick-up coordinates from a map pin drop. Null clears any saved pin.</summary>
    double? Latitude  = null,
    double? Longitude = null
);

// ── Command ───────────────────────────────────────────────────────────────────

public sealed record UpdateCustomerCommand(
    Guid             CustomerId,
    UpdateCustomerDto Dto,
    /// <summary>When set (tenant co-admin edit), the customer must belong to this tenant or it 404s.</summary>
    Guid?            RequireTenantId = null
) : IRequest;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class UpdateCustomerCommandValidator : AbstractValidator<UpdateCustomerCommand>
{
    public UpdateCustomerCommandValidator()
    {
        RuleFor(x => x.Dto.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.IdNumber).MaximumLength(50);
        RuleFor(x => x.Dto.BusinessName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Dto.PhoneNumber).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Dto.City).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.District).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.Address).NotEmpty().MaximumLength(250);
        RuleFor(x => x.Dto.Latitude)
            .InclusiveBetween(-90, 90)
            .When(x => x.Dto.Latitude.HasValue);
        RuleFor(x => x.Dto.Longitude)
            .InclusiveBetween(-180, 180)
            .When(x => x.Dto.Longitude.HasValue);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class UpdateCustomerCommandHandler : IRequestHandler<UpdateCustomerCommand>
{
    private readonly IAppDbContext _context;
    public UpdateCustomerCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(UpdateCustomerCommand request, CancellationToken cancellationToken)
    {
        var dto = request.Dto;

        var customer = await _context.Customers
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        // A tenant co-admin may only edit their own tenant's customers.
        if (request.RequireTenantId is Guid rt && customer.TenantId != rt)
            throw new NotFoundException("Customer", request.CustomerId);

        customer.FirstName    = dto.FirstName;
        customer.LastName     = dto.LastName;
        customer.IdNumber     = string.IsNullOrWhiteSpace(dto.IdNumber) ? null : dto.IdNumber.Trim();
        customer.BusinessName = dto.BusinessName;
        customer.PhoneNumber  = dto.PhoneNumber;
        customer.City         = dto.City;
        customer.District     = dto.District;
        customer.Address      = dto.Address;
        customer.Latitude     = dto.Latitude;
        customer.Longitude    = dto.Longitude;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
