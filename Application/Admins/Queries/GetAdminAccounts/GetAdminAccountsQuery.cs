using Application.Admins.DTOs;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;

namespace Application.Admins.Queries.GetAdminAccounts;

/// <summary>Admin-role accounts the system admin may reset (everyone except itself).</summary>
public sealed record GetAdminAccountsQuery() : IRequest<IReadOnlyList<AdminAccountDto>>;

public sealed class GetAdminAccountsQueryHandler
    : IRequestHandler<GetAdminAccountsQuery, IReadOnlyList<AdminAccountDto>>
{
    private readonly UserManager<ApplicationUser> _userManager;

    public GetAdminAccountsQueryHandler(UserManager<ApplicationUser> userManager)
        => _userManager = userManager;

    public async Task<IReadOnlyList<AdminAccountDto>> Handle(
        GetAdminAccountsQuery request, CancellationToken cancellationToken)
    {
        IList<ApplicationUser> users = await _userManager.GetUsersInRoleAsync("Admin");

        return users
            .Where(u => !SystemAdminAccount.IsSystemAdmin(u.UserName))
            .OrderBy(u => u.FirstName)
            .ThenBy(u => u.LastName)
            .Select(u => new AdminAccountDto(
                Id:        u.Id,
                FirstName: u.FirstName,
                LastName:  u.LastName,
                Username:  u.UserName ?? string.Empty,
                Email:     u.Email))
            .ToList();
    }
}
