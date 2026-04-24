using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;

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

        // 1. Create the Identity user — email is used as UserName so login works with email
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

        // 2. Create the domain Customer entity
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
            ApplicationUserId = user.Id
        };

        _context.Customers.Add(customer);
        await _context.SaveChangesAsync(cancellationToken);

        return customer.Id;
    }
}
