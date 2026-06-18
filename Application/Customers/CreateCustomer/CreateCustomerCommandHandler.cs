using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.Commands.CreateCustomer;

public sealed class CreateCustomerCommandHandler : IRequestHandler<CreateCustomerCommand, Guid>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    public CreateCustomerCommandHandler(
        IAppDbContext context,
        UserManager<ApplicationUser> userManager)
    {
        _context     = context;
        _userManager = userManager;
    }

    public async Task<Guid> Handle(CreateCustomerCommand request, CancellationToken cancellationToken)
    {
        var dto = request.Dto;

        // Phone is no longer unique — one owner may run several businesses on the same
        // number. Uniqueness now lives on email and business name instead.

        // 1. Business name must be unique. It isn't an Identity field, so check it
        //    explicitly and surface a clean, translatable error (keyed by a sentinel
        //    code the client maps) rather than letting the unique index throw.
        var businessNameExists = await _context.Customers
            .AnyAsync(c => c.BusinessName == dto.BusinessName, cancellationToken);

        if (businessNameExists)
        {
            throw new ValidationException(new[]
            {
                new ValidationFailure(
                    "DuplicateBusinessName",
                    "This business name is already registered.")
            });
        }

        // 2. Email uniqueness is enforced natively by Identity below (RequireUniqueEmail
        //    + UserName == Email); a duplicate surfaces as a DuplicateUserName/
        //    DuplicateEmail code that the client maps to a friendly, translated message.

        // Create the Identity user — email is used as UserName so login works with email
        var user = new ApplicationUser
        {
            Email         = dto.Email,
            UserName      = dto.Email,       // ← Identity login key
            FirstName     = dto.FirstName,
            LastName      = dto.LastName,
            Role          = "Customer"
        };

        var createResult = await _userManager.CreateAsync(user, dto.Password);
        if (!createResult.Succeeded)
        {
            var failures = createResult.Errors
                .Select(e => new ValidationFailure(e.Code, e.Description));
            throw new ValidationException(failures);
        }

        await _userManager.AddToRoleAsync(user, "Customer");

        // Create the domain Customer entity
        var customer = new Customer
        {
            FirstName         = dto.FirstName,
            LastName          = dto.LastName,
            IdNumber          = string.IsNullOrWhiteSpace(dto.IdNumber) ? null : dto.IdNumber.Trim(),
            BusinessName      = dto.BusinessName,
            PhoneNumber       = dto.PhoneNumber,
            City              = dto.City,
            District          = dto.District,
            Address           = dto.Address,
            IsCompanyServicePriceIncludedInPrice = dto.IsCompanyServicePriceIncludedInPrice,
            ApplicationUserId = user.Id
        };

        _context.Customers.Add(customer);
        await _context.SaveChangesAsync(cancellationToken);

        return customer.Id;
    }
}
