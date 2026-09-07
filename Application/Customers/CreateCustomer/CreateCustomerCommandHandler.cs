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

        // 0. Walk-in link: an admin may have registered this person at the office with no
        //    account (Customer.ApplicationUserId == null) via the "Add Package" flow. When
        //    the same person now signs up, attach this login to that existing row — matched
        //    on phone + ID number — instead of creating a duplicate. The office-entered
        //    details (name, business, address) are kept as-is.
        Customer? walkIn = null;
        if (!string.IsNullOrWhiteSpace(dto.IdNumber))
        {
            var idNum = dto.IdNumber.Trim();
            walkIn = await _context.Customers.FirstOrDefaultAsync(
                c => c.ApplicationUserId == null
                  && c.PhoneNumber == dto.PhoneNumber
                  && c.IdNumber == idNum,
                cancellationToken);
        }

        // 1. Business name must be unique. It isn't an Identity field, so check it
        //    explicitly and surface a clean, translatable error (keyed by a sentinel
        //    code the client maps) rather than letting the unique index throw. Skipped on
        //    the walk-in link path — that row already owns its business name.
        if (walkIn is null)
        {
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

        // Tenant resolution: an explicit TenantId (admin path) wins; otherwise, if the customer
        // self-registered on a white-label host, resolve it to an active tenant and stamp that.
        Guid? tenantId = dto.TenantId;
        if (tenantId is null && !string.IsNullOrWhiteSpace(dto.RegistrationHost))
        {
            var host = NormalizeHost(dto.RegistrationHost);
            if (host.Length > 0)
                tenantId = await _context.Tenants
                    .Where(t => t.IsActive && t.Host.ToLower() == host)
                    .Select(t => (Guid?)t.Id)
                    .FirstOrDefaultAsync(cancellationToken);
        }

        // Walk-in link path: attach the new login to the existing office-created row and
        // keep its details. Only fill the tenant if the row had none and one was resolved.
        if (walkIn is not null)
        {
            walkIn.ApplicationUserId = user.Id;
            if (walkIn.TenantId is null && tenantId is not null)
                walkIn.TenantId = tenantId;

            await _context.SaveChangesAsync(cancellationToken);
            return walkIn.Id;
        }

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
            Latitude          = dto.Latitude,
            Longitude         = dto.Longitude,
            IsCompanyServicePriceIncludedInPrice = dto.IsCompanyServicePriceIncludedInPrice,
            ApplicationUserId = user.Id,
            // Null = root brand (dilo). From admin assignment or host-stamped self-registration.
            TenantId          = tenantId
        };

        _context.Customers.Add(customer);
        await _context.SaveChangesAsync(cancellationToken);

        return customer.Id;
    }

    /// <summary>Lower-cases, drops a port and a leading "www." so a host matches the stored value.</summary>
    private static string NormalizeHost(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var h = raw.Trim().ToLowerInvariant();
        int colon = h.IndexOf(':');
        if (colon >= 0) h = h[..colon];
        if (h.StartsWith("www.")) h = h[4..];
        return h;
    }
}
