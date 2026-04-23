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
        // 1. Find user by username
        var user = await _userManager.FindByNameAsync(request.Username)
            ?? throw new NotFoundException(nameof(ApplicationUser), request.Username);

        // 2. Verify password
        var passwordValid = await _userManager.CheckPasswordAsync(user, request.Password);
        if (!passwordValid)
            throw new ForbiddenException("Invalid username or password.");

        // 3. Check lockout
        if (await _userManager.IsLockedOutAsync(user))
            throw new ForbiddenException("Account is locked out. Please try again later.");

        // 4. Get role
        var roles = await _userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault()
            ?? throw new ForbiddenException("User has no assigned role.");

        // 5. If courier, fetch domain Courier ID for JWT claim
        Guid? courierId = null;
        if (role == "Courier")
        {
            var courier = await _context.Couriers
                .FirstOrDefaultAsync(c => c.ApplicationUserId == user.Id, cancellationToken)
                ?? throw new NotFoundException(nameof(Courier), user.Id);

            courierId = courier.Id;
        }

        // 6. Generate token
        var expiresAt = DateTime.UtcNow.AddMinutes(480);
        var token = _jwtGenerator.GenerateToken(user, role, courierId);

        return new LoginResultDto(
            Token: token,
            Username: user.UserName ?? user.Id,
            FirstName: user.FirstName,
            LastName: user.LastName,
            Role: role,
            ExpiresAt: expiresAt
        );
    }
}