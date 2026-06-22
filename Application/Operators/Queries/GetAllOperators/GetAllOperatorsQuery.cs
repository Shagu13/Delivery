using Application.Operators.DTOs;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;

namespace Application.Operators.Queries.GetAllOperators;

public sealed record GetAllOperatorsQuery() : IRequest<IReadOnlyList<OperatorDto>>;

public sealed class GetAllOperatorsQueryHandler
    : IRequestHandler<GetAllOperatorsQuery, IReadOnlyList<OperatorDto>>
{
    private readonly UserManager<ApplicationUser> _userManager;

    public GetAllOperatorsQueryHandler(UserManager<ApplicationUser> userManager)
        => _userManager = userManager;

    public async Task<IReadOnlyList<OperatorDto>> Handle(
        GetAllOperatorsQuery request, CancellationToken cancellationToken)
    {
        var users = await _userManager.GetUsersInRoleAsync("Operator");

        return users
            .OrderBy(u => u.FirstName)
            .ThenBy(u => u.LastName)
            .Select(u => new OperatorDto(
                Id:        u.Id,
                FirstName: u.FirstName,
                LastName:  u.LastName,
                Username:  u.UserName ?? string.Empty,
                Email:     u.Email))
            .ToList();
    }
}
