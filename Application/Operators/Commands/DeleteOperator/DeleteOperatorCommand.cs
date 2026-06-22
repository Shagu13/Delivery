using Application.Common.Exceptions;
using Domain;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;

namespace Application.Operators.Commands.DeleteOperator;

/// <summary>
/// Removes an Operator login. Operators own no operational data, so the backing
/// ApplicationUser is hard-deleted.
/// </summary>
public sealed record DeleteOperatorCommand(string Id) : IRequest;

public sealed class DeleteOperatorCommandHandler : IRequestHandler<DeleteOperatorCommand>
{
    private readonly UserManager<ApplicationUser> _userManager;

    public DeleteOperatorCommandHandler(UserManager<ApplicationUser> userManager)
        => _userManager = userManager;

    public async Task Handle(DeleteOperatorCommand request, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByIdAsync(request.Id)
            ?? throw new NotFoundException(nameof(ApplicationUser), request.Id);

        // Guard: only ever delete Operator users through this path.
        if (!await _userManager.IsInRoleAsync(user, "Operator"))
            throw new NotFoundException(nameof(ApplicationUser), request.Id);

        var result = await _userManager.DeleteAsync(user);
        if (!result.Succeeded)
            throw new ValidationException(
                result.Errors.Select(e => new ValidationFailure(e.Code, e.Description)));
    }
}
