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
    string  Address
);

// ── Command ───────────────────────────────────────────────────────────────────

public sealed record UpdateCustomerCommand(
    Guid             CustomerId,
    UpdateCustomerDto Dto
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

        customer.FirstName    = dto.FirstName;
        customer.LastName     = dto.LastName;
        customer.IdNumber     = string.IsNullOrWhiteSpace(dto.IdNumber) ? null : dto.IdNumber.Trim();
        customer.BusinessName = dto.BusinessName;
        customer.PhoneNumber  = dto.PhoneNumber;
        customer.City         = dto.City;
        customer.District     = dto.District;
        customer.Address      = dto.Address;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
