using API.Models.Customers;
using Application.Customers.Commands.CreateCustomer;
using Application.Customers.DTOs;
using Application.Customers.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace API.Controllers;

public sealed class CustomersController : BaseController
{
    // ── POST /api/customers ──────────────────────────────────────────────────
    /// <summary>
    /// Create a new customer account. Admin only.
    /// Creates the Identity login (role "Customer") and the domain Customer entity.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CreateCustomerResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Create(
        [FromBody] CreateCustomerRequest request,
        CancellationToken ct)
    {
        var command = new CreateCustomerCommand(
            new CreateCustomerDto(
                FirstName:    request.FirstName,
                LastName:     request.LastName,
                IdNumber:     request.IdNumber,
                BusinessName: request.BusinessName,
                PhoneNumber:  request.PhoneNumber,
                City:         request.City,
                District:     request.District,
                Address:      request.Address,
                Username:     request.Username,
                Password:     request.Password
            )
        );

        var customerId = await Sender.Send(command, ct);

        return CreatedAtAction(
            actionName: nameof(GetById),
            routeValues: new { id = customerId },
            value: new CreateCustomerResponse(
                CustomerId: customerId,
                Username:   request.Username,
                FullName:   $"{request.FirstName} {request.LastName}"
            ));
    }

    // ── GET /api/customers/me ────────────────────────────────────────────────
    /// <summary>
    /// Returns the Customer profile for the currently logged-in Customer.
    /// Used by the frontend to pre-fill SenderSection when creating a GroupOrder.
    /// Resolved via the ApplicationUserId embedded in the JWT subject claim.
    /// </summary>
    [HttpGet("me")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(CustomerListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMe(CancellationToken ct)
    {
        // ClaimTypes.NameIdentifier = ApplicationUser.Id (set in JwtTokenGenerator)
        var applicationUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("User identity not found in token.");

        var dto = await Sender.Send(
            new GetCustomerByApplicationUserIdQuery(applicationUserId), ct);

        return Ok(dto);
    }

    // ── GET /api/customers ───────────────────────────────────────────────────
    /// <summary>Paginated list of all customers. Admin only.</summary>
    [HttpGet]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery] int    page     = 1,
        [FromQuery] int    pageSize = 20,
        [FromQuery] string search   = "",
        CancellationToken ct = default)
    {
        var result = await Sender.Send(
            new GetAllCustomersQuery(page, pageSize, search), ct);
        return Ok(result);
    }

    // ── POST /api/customers/register ────────────────────────────────────────
    /// <summary>
    /// Public self-registration endpoint. No authentication required.
    /// Creates the Identity login (role "Customer") and the domain Customer entity.
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(CreateCustomerResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Register(
        [FromBody] CreateCustomerRequest request,
        CancellationToken ct)
    {
        var command = new CreateCustomerCommand(
            new CreateCustomerDto(
                FirstName:    request.FirstName,
                LastName:     request.LastName,
                IdNumber:     request.IdNumber,
                BusinessName: request.BusinessName,
                PhoneNumber:  request.PhoneNumber,
                City:         request.City,
                District:     request.District,
                Address:      request.Address,
                Username:     request.Username,
                Password:     request.Password
            )
        );

        var customerId = await Sender.Send(command, ct);

        return CreatedAtAction(
            actionName: nameof(GetById),
            routeValues: new { id = customerId },
            value: new CreateCustomerResponse(
                CustomerId: customerId,
                Username:   request.Username,
                FullName:   $"{request.FirstName} {request.LastName}"
            ));
    }

    // ── GET /api/customers/{id} ──────────────────────────────────────────────
    /// <summary>
    /// Get a single customer by domain ID.
    /// Admin: any customer. Customer: own record only.
    /// </summary>
    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Admin,Customer")]
    [ProducesResponseType(typeof(CustomerListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var dto = await Sender.Send(new GetCustomerByIdQuery(id), ct);
        return Ok(dto);
    }
}
