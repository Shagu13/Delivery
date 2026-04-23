using Application.Customers.DTOs;
using MediatR;

namespace Application.Customers.Commands.CreateCustomer;

/// <summary>
/// Creates a Customer domain entity alongside its backing ApplicationUser.
/// Returns the new Customer's domain ID.
/// </summary>
public sealed record CreateCustomerCommand(
    CreateCustomerDto Dto
) : IRequest<Guid>;
