using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers.Commands.UpdateCourier;

public sealed record UpdateCourierCommand(
    Guid     CourierId,
    string   Username,
    string?  NewPassword,
    string   PhoneNumber,
    string   IdNumber,
    /// <summary>Standard per-order salary — only allowed for couriers in an eligible city
    /// (see <see cref="Application.Couriers.CourierSalaryEligibility"/>); null clears it.</summary>
    decimal? DefaultSalary = null
) : IRequest;

public sealed class UpdateCourierCommandHandler : IRequestHandler<UpdateCourierCommand>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    public UpdateCourierCommandHandler(IAppDbContext context, UserManager<ApplicationUser> userManager)
    {
        _context = context;
        _userManager = userManager;
    }

    public async Task Handle(UpdateCourierCommand request, CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .Include(c => c.ApplicationUser)
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.Courier), request.CourierId);

        var user = courier.ApplicationUser;

        // Update username if changed
        if (!string.Equals(user.UserName, request.Username, StringComparison.OrdinalIgnoreCase))
        {
            var setNameResult = await _userManager.SetUserNameAsync(user, request.Username);
            if (!setNameResult.Succeeded)
            {
                var failures = setNameResult.Errors.Select(e => new ValidationFailure(e.Code, e.Description));
                throw new ValidationException(failures);
            }
        }

        // Force-reset password if provided (admin privilege — no current password needed)
        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var resetResult = await _userManager.ResetPasswordAsync(user, token, request.NewPassword);
            if (!resetResult.Succeeded)
            {
                var failures = resetResult.Errors.Select(e => new ValidationFailure(e.Code, e.Description));
                throw new ValidationException(failures);
            }
        }

        // Update phone number and ID number on the Courier entity
        courier.PhoneNumber = request.PhoneNumber.Trim();
        courier.IdNumber    = request.IdNumber.Trim();

        // Only couriers in an eligible city get a standard per-order rate (see
        // Courier.DefaultSalary doc comment).
        if (request.DefaultSalary is decimal salary)
        {
            if (salary < 0)
                throw new ValidationException(new[] {
                    new ValidationFailure("DefaultSalary", "Default salary must be a non-negative value.")
                });
            if (!Application.Couriers.CourierSalaryEligibility.IsEligible(courier.AssignedCity))
                throw new ConflictException("Default salary can only be set for couriers assigned to " +
                    string.Join(" or ", Application.Couriers.CourierSalaryEligibility.EligibleCities) + ".");
        }
        courier.DefaultSalary = request.DefaultSalary;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
