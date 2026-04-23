using Application.Couriers.DTOs;
using MediatR;

namespace Application.Couriers.Commands.CreateCourier;

/// <summary>
/// Creates a Courier domain entity alongside its backing ApplicationUser (login credentials).
/// Returns the new Courier's domain ID.
/// </summary>
public sealed record CreateCourierCommand(
    CreateCourierDto Dto
) : IRequest<Guid>;
