using Application.Auth.DTOs;
using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Application.Auth.Commands.Login;

public sealed class LoginCommandHandler : IRequestHandler<LoginCommand, LoginResultDto>
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IJwtTokenGenerator _jwtGenerator;
    private readonly IAppDbContext _context;

    public LoginCommandHandler(
        UserManager<ApplicationUser> userManager,
        IJwtTokenGenerator jwtGenerator,
        IAppDbContext context)
    {
        _userManager = userManager;
        _jwtGenerator = jwtGenerator;
        _context = context;
    }

    public async Task<LoginResultDto> Handle(LoginCommand request, CancellationToken cancellationToken)
    {
        // 1. Find user — try by username first, then by email
        //    Customers register with email-as-username, but staff may use plain usernames.
        var user = await _userManager.FindByNameAsync(request.Username)
                ?? await _userManager.FindByEmailAsync(request.Username)
                ?? throw new ForbiddenException("Invalid username or password.");

        // 2. Verify password
        var passwordValid = await _userManager.CheckPasswordAsync(user, request.Password);
        if (!passwordValid)
            throw new ForbiddenException("Invalid username or password.");

        // 3. Check lockout
        if (await _userManager.IsLockedOutAsync(user))
            throw new ForbiddenException("Account is locked out. Please try again later.");

        // 4. Get role
        var roles = await _userManager.GetRolesAsync(user);
        var role  = roles.FirstOrDefault()
            ?? throw new ForbiddenException("User has no assigned role.");

        // 5. Embed domain IDs for the relevant JWT claims
        Guid? courierId  = null;
        Guid? customerId = null;
        Guid? tenantId   = null;

        if (role == "Courier")
        {
            var courier = await _context.Couriers
                .FirstOrDefaultAsync(c => c.ApplicationUserId == user.Id, cancellationToken)
                ?? throw new NotFoundException(nameof(Courier), user.Id);
            courierId = courier.Id;
        }
        else if (role == "Customer")
        {
            var customer = await _context.Customers
                .FirstOrDefaultAsync(c => c.ApplicationUserId == user.Id, cancellationToken)
                ?? throw new NotFoundException(nameof(Customer), user.Id);

            if (!customer.IsActive)
                throw new ForbiddenException("This account has been deactivated. Please contact support.");

            customerId = customer.Id;
            // Tenant-owned (livo) customers carry their tenant; root (dilo) customers stay null.
            tenantId   = customer.TenantId;
        }
        else if (role == "TenantAdmin")
        {
            // The co-admin's tenant is the one whose AdminApplicationUserId points back at them.
            var tenant = await _context.Tenants
                .FirstOrDefaultAsync(t => t.AdminApplicationUserId == user.Id, cancellationToken)
                ?? throw new NotFoundException(nameof(Tenant), user.Id);

            if (!tenant.IsActive)
                throw new ForbiddenException("This tenant has been deactivated. Please contact support.");

            tenantId = tenant.Id;
        }

        // 6. Generate token
        var expiresAt = CustomTime.Now.AddMinutes(480);
        var token = _jwtGenerator.GenerateToken(user, role, courierId, customerId, tenantId);

        // The dedicated "systemadmin" account is the only Admin that owns the
        // white-label Tenants management page (create/edit tenants).
        bool isSystemAdmin = role == "Admin"
            && string.Equals(user.UserName, "systemadmin", StringComparison.OrdinalIgnoreCase);

        return new LoginResultDto(
            Token:      token,
            Username:   user.Email ?? user.UserName ?? user.Id,
            FirstName:  user.FirstName,
            LastName:   user.LastName,
            Role:       role,
            ExpiresAt:  expiresAt,
            CustomerId: customerId,
            TenantId:   tenantId,
            IsSystemAdmin: isSystemAdmin
        );
    }
}