using API.Models.Operators;
using Application.Operators.Commands.CreateOperator;
using Application.Operators.Commands.DeleteOperator;
using Application.Operators.Commands.UpdateOperator;
using Application.Operators.DTOs;
using Application.Operators.Queries.GetAllOperators;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Manages Operator accounts — back-office staff with partial admin access
/// (Overview + accepting batches on the Pick-Up page). Admin only.
/// </summary>
[Authorize(Roles = "Admin")]
public sealed class OperatorsController : BaseController
{
    // ── GET /api/operators ────────────────────────────────────────────────────
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<OperatorDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var result = await Sender.Send(new GetAllOperatorsQuery(), ct);
        return Ok(result);
    }

    // ── POST /api/operators ───────────────────────────────────────────────────
    [HttpPost]
    [ProducesResponseType(typeof(CreateOperatorResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Create([FromBody] CreateOperatorRequest request, CancellationToken ct)
    {
        var id = await Sender.Send(new CreateOperatorCommand(
            FirstName: request.FirstName,
            LastName:  request.LastName,
            Username:  request.Username,
            Password:  request.Password), ct);

        return CreatedAtAction(
            actionName: nameof(GetAll),
            routeValues: null,
            value: new CreateOperatorResponse(
                Id:       id,
                Username: request.Username,
                FullName: $"{request.FirstName} {request.LastName}"));
    }

    // ── PUT /api/operators/{id} ───────────────────────────────────────────────
    [HttpPut("{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateOperatorRequest request, CancellationToken ct)
    {
        var newPassword = string.IsNullOrWhiteSpace(request.NewPassword) ? null : request.NewPassword;
        await Sender.Send(new UpdateOperatorCommand(
            Id:          id,
            FirstName:   request.FirstName,
            LastName:    request.LastName,
            Username:    request.Username,
            NewPassword: newPassword), ct);
        return NoContent();
    }

    // ── DELETE /api/operators/{id} ────────────────────────────────────────────
    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await Sender.Send(new DeleteOperatorCommand(id), ct);
        return NoContent();
    }
}
