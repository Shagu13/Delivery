using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers.Commands.SetCourierActiveStatus;

public sealed record SetCourierActiveStatusCommand(Guid CourierId, bool IsActive)
    : IRequest;

public sealed class SetCourierActiveStatusCommandHandler : IRequestHandler<SetCourierActiveStatusCommand>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    public SetCourierActiveStatusCommandHandler(IAppDbContext context, UserManager<ApplicationUser> userManager)
    {
        _context = context;
        _userManager = userManager;
    }

    public async Task Handle(SetCourierActiveStatusCommand request, CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .Include(c => c.ApplicationUser)
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.Courier), request.CourierId);

        courier.IsActive = request.IsActive;

        var user = courier.ApplicationUser;
        if (request.IsActive)
        {
            // Re-enable login: clear lockout
            await _userManager.SetLockoutEnabledAsync(user, true);
            await _userManager.SetLockoutEndDateAsync(user, null);
        }
        else
        {
            // Block login: lock out indefinitely
            await _userManager.SetLockoutEnabledAsync(user, true);
            await _userManager.SetLockoutEndDateAsync(user, DateTimeOffset.MaxValue);
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
