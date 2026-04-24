using API.Models.Customers;
using Application.Common.Exceptions;
using Application.Customers.Commands.ChangePassword;
using Application.Customers.Commands.CreateCustomer;
using Application.Customers.Commands.UpdateCustomer;
using Application.Customers.DTOs;
using Application.Customers.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace API.Controllers;

public sealed class CustomersController : BaseController
{
    // ── POST /api/customers/register ─────────────────────────────────────────
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register(
        [FromBody] RegisterCustomerRequest request, CancellationToken ct)
    {
        if (request.Password != request.ConfirmPassword)
            throw new ValidationException(
                new[] { new FluentValidation.Results.ValidationFailure(
                    "ConfirmPassword", "Passwords do not match.") });

        var customerId = await Sender.Send(BuildCommand(
            request.FirstName, request.LastName, request.IdNumber,
            request.BusinessName, request.PhoneNumber,
            request.City, request.District, request.Address,
            request.Email, request.Password), ct);

        return CreatedAtAction(nameof(GetById), new { id = customerId },
            new CreateCustomerResponse(customerId, request.Email,
                $"{request.FirstName} {request.LastName}"));
    }

    // ── POST /api/customers ───────────────────────────────────────────────────
    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create(
        [FromBody] CreateCustomerRequest request, CancellationToken ct)
    {
        var customerId = await Sender.Send(BuildCommand(
            request.FirstName, request.LastName, request.IdNumber,
            request.BusinessName, request.PhoneNumber,
            request.City, request.District, request.Address,
            request.Email, request.Password), ct);

        return CreatedAtAction(nameof(GetById), new { id = customerId },
            new CreateCustomerResponse(customerId, request.Email,
                $"{request.FirstName} {request.LastName}"));
    }

    // ── GET /api/customers/me ─────────────────────────────────────────────────
    [HttpGet("me")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> GetMe(CancellationToken ct)
    {
        var appUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException();
        var dto = await Sender.Send(new GetCustomerByApplicationUserIdQuery(appUserId), ct);
        return Ok(dto);
    }

    // ── PUT /api/customers/me ─────────────────────────────────────────────────
    /// <summary>Customer edits their own profile details.</summary>
    [HttpPut("me")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> UpdateMe(
        [FromBody] UpdateCustomerRequest request, CancellationToken ct)
    {
        var customerId = GetCustomerIdFromToken();

        await Sender.Send(new UpdateCustomerCommand(
            customerId,
            new UpdateCustomerDto(
                request.FirstName, request.LastName, request.IdNumber,
                request.BusinessName, request.PhoneNumber,
                request.City, request.District, request.Address)
        ), ct);

        return NoContent();
    }

    // ── PUT /api/customers/me/password ────────────────────────────────────────
    /// <summary>Customer changes their own password.</summary>
    [HttpPut("me/password")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        if (request.NewPassword != request.ConfirmNewPassword)
            throw new ValidationException(
                new[] { new FluentValidation.Results.ValidationFailure(
                    "ConfirmNewPassword", "Passwords do not match.") });

        var appUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException();

        await Sender.Send(new ChangePasswordCommand(
            appUserId, request.CurrentPassword, request.NewPassword), ct);

        return NoContent();
    }

    // ── GET /api/customers ────────────────────────────────────────────────────
    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] string search = "", CancellationToken ct = default)
    {
        var result = await Sender.Send(new GetAllCustomersQuery(page, pageSize, search), ct);
        return Ok(result);
    }

    // ── GET /api/customers/{id} ───────────────────────────────────────────────
    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Admin,Customer")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var dto = await Sender.Send(new GetCustomerByIdQuery(id), ct);
        return Ok(dto);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Guid GetCustomerIdFromToken()
    {
        var claim = User.FindFirst("customerId")?.Value;
        return Guid.TryParse(claim, out var id)
            ? id
            : throw new UnauthorizedAccessException("Customer ID not found in token.");
    }

    private static CreateCustomerCommand BuildCommand(
        string firstName, string lastName, string? idNumber,
        string businessName, string phoneNumber,
        string city, string district, string address,
        string email, string password) =>
        new(new CreateCustomerDto(firstName, lastName, idNumber,
            businessName, phoneNumber, city, district, address, email, password));
}
