using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Couriers.DTOs;
using Domain;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;

namespace Application.Couriers.Commands.CreateCourier;

public sealed class CreateCourierCommandHandler : IRequestHandler<CreateCourierCommand, Guid>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    public CreateCourierCommandHandler(
        IAppDbContext context,
        UserManager<ApplicationUser> userManager)
    {
        _context = context;
        _userManager = userManager;
    }

    public async Task<Guid> Handle(CreateCourierCommand request, CancellationToken cancellationToken)
    {
        var dto = request.Dto;

        // 1. Create the Identity user that backs this courier's login
        var user = new ApplicationUser
        {
            UserName = dto.Username,
            Email = $"{dto.Username}@courier.local",
            FirstName = dto.FirstName,
            LastName = dto.LastName,
            Role = "Courier"
        };

        var createResult = await _userManager.CreateAsync(user, dto.Password);
        if (!createResult.Succeeded)
        {
            var failures = createResult.Errors
                .Select(e => new ValidationFailure(e.Code, e.Description));
            throw new ValidationException(failures);
        }

        await _userManager.AddToRoleAsync(user, "Courier");

        // 2. Create the domain Courier entity linked to that user
        var courier = new Domain.Courier
        {
            FirstName = dto.FirstName,
            LastName = dto.LastName,
            IdNumber = dto.IdNumber,
            PhoneNumber = dto.PhoneNumber,
            AssignedCity = dto.AssignedCity,
            AssignedDistrict = dto.AssignedDistrict,
            ApplicationUserId = user.Id
        };

        _context.Couriers.Add(courier);
        await _context.SaveChangesAsync(cancellationToken);

        return courier.Id;
    }
}
