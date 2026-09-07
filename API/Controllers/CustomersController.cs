using API.Models.Customers;
using Application.Common.Exceptions;
using Application.Customers.BankAccounts.Commands;
using Application.Customers.BankAccounts.Queries;
using Application.Customers.Commands.AdminSetPassword;
using Application.Customers.Commands.ChangePassword;
using Application.Customers.Commands.CreateCustomer;
using Application.Customers.Commands.SetActive;
using Application.Customers.Commands.SetCompanyPrice;
using Application.Customers.Commands.SetTenant;
using Application.Customers.Commands.UpdateCustomer;
using Application.Customers.DTOs;
using Application.Customers.Queries;
using Application.Customers.SecondaryAddresses.Commands;
using Application.Customers.SecondaryAddresses.Queries;
using Application.Customers.SpecialPrices.Commands;
using Application.Customers.SpecialPrices.Queries;
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
            request.Email, request.Password,
            // Self-registration: stamp the tenant from the host they signed up on (if any).
            registrationHost: Request.Host.Host,
            latitude: request.Latitude, longitude: request.Longitude), ct);

        return CreatedAtAction(nameof(GetById), new { id = customerId },
            new CreateCustomerResponse(customerId, request.Email,
                $"{request.FirstName} {request.LastName}"));
    }

    // ── POST /api/customers  (Admin/Operator — any tenant; TenantAdmin — own tenant) ───
    [HttpPost]
    [Authorize(Roles = "Admin,Operator,TenantAdmin")]
    public async Task<IActionResult> Create(
        [FromBody] CreateCustomerRequest request, CancellationToken ct)
    {
        // A tenant co-admin can only create customers under their own tenant — force it
        // from the JWT claim and ignore any TenantId in the body. Admins keep free choice.
        var tenantId = CurrentTenantId ?? request.TenantId;

        var customerId = await Sender.Send(BuildCommand(
            request.FirstName, request.LastName, request.IdNumber,
            request.BusinessName, request.PhoneNumber,
            request.City, request.District, request.Address,
            request.Email, request.Password,
            request.IsCompanyServicePriceIncludedInPrice,
            tenantId,
            latitude: request.Latitude, longitude: request.Longitude), ct);

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
        // Returns CustomerResponseDto — does NOT include company pricing fields
        var dto = await Sender.Send(new GetCustomerByApplicationUserIdQuery(appUserId), ct);
        return Ok(dto);
    }

    // ── PUT /api/customers/me ─────────────────────────────────────────────────
    [HttpPut("me")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> UpdateMe(
        [FromBody] UpdateCustomerRequest request, CancellationToken ct)
    {
        var customerId = GetCustomerIdFromToken();

        await Sender.Send(new UpdateCustomerCommand(
            customerId,
            new UpdateCustomerDto(
                request.FirstName, request.LastName, request.IdNumber,
                request.BusinessName, request.PhoneNumber,
                request.City, request.District, request.Address,
                request.Latitude, request.Longitude)
        ), ct);

        return NoContent();
    }

    // ── PUT /api/customers/me/password ────────────────────────────────────────
    [HttpPut("me/password")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
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

    // ── GET /api/customers/me/addresses  (saved pickup addresses beyond the main one) ──
    [HttpGet("me/addresses")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> GetMyAddresses(CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerSecondaryAddressesQuery(GetCustomerIdFromToken()), ct);
        return Ok(result);
    }

    // ── POST /api/customers/me/addresses  (capped at 5 — see AddCustomerSecondaryAddressCommand) ──
    [HttpPost("me/addresses")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> AddMyAddress(
        [FromBody] SecondaryAddressRequest request, CancellationToken ct)
    {
        var customerId = GetCustomerIdFromToken();
        await Sender.Send(new AddCustomerSecondaryAddressCommand(
            customerId, request.Label, request.City, request.District, request.Address), ct);
        var result = await Sender.Send(new GetCustomerSecondaryAddressesQuery(customerId), ct);
        return Ok(result);
    }

    // ── PUT /api/customers/me/addresses/{addressId} ────────────────────────────
    [HttpPut("me/addresses/{addressId:guid}")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> UpdateMyAddress(
        Guid addressId, [FromBody] SecondaryAddressRequest request, CancellationToken ct)
    {
        var customerId = GetCustomerIdFromToken();
        await Sender.Send(new UpdateCustomerSecondaryAddressCommand(
            customerId, addressId, request.Label, request.City, request.District, request.Address), ct);
        var result = await Sender.Send(new GetCustomerSecondaryAddressesQuery(customerId), ct);
        return Ok(result);
    }

    // ── DELETE /api/customers/me/addresses/{addressId} ─────────────────────────
    [HttpDelete("me/addresses/{addressId:guid}")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> DeleteMyAddress(Guid addressId, CancellationToken ct)
    {
        var customerId = GetCustomerIdFromToken();
        await Sender.Send(new DeleteCustomerSecondaryAddressCommand(customerId, addressId), ct);
        var result = await Sender.Send(new GetCustomerSecondaryAddressesQuery(customerId), ct);
        return Ok(result);
    }

    // ── GET /api/customers/me/bank-accounts  (saved bank accounts for payout lookup) ──
    [HttpGet("me/bank-accounts")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> GetMyBankAccounts(CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerBankAccountsQuery(GetCustomerIdFromToken()), ct);
        return Ok(result);
    }

    // ── POST /api/customers/me/bank-accounts  (capped at 5 — see AddCustomerBankAccountCommand) ──
    [HttpPost("me/bank-accounts")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> AddMyBankAccount(
        [FromBody] BankAccountRequest request, CancellationToken ct)
    {
        var customerId = GetCustomerIdFromToken();
        await Sender.Send(new AddCustomerBankAccountCommand(
            customerId, request.Label, request.BankName, request.AccountHolderName, request.AccountNumber), ct);
        var result = await Sender.Send(new GetCustomerBankAccountsQuery(customerId), ct);
        return Ok(result);
    }

    // ── PUT /api/customers/me/bank-accounts/{accountId} ────────────────────────
    [HttpPut("me/bank-accounts/{accountId:guid}")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> UpdateMyBankAccount(
        Guid accountId, [FromBody] BankAccountRequest request, CancellationToken ct)
    {
        var customerId = GetCustomerIdFromToken();
        await Sender.Send(new UpdateCustomerBankAccountCommand(
            customerId, accountId, request.Label, request.BankName, request.AccountHolderName, request.AccountNumber), ct);
        var result = await Sender.Send(new GetCustomerBankAccountsQuery(customerId), ct);
        return Ok(result);
    }

    // ── PUT /api/customers/me/bank-accounts/{accountId}/default ────────────────
    [HttpPut("me/bank-accounts/{accountId:guid}/default")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> SetDefaultMyBankAccount(Guid accountId, CancellationToken ct)
    {
        var customerId = GetCustomerIdFromToken();
        await Sender.Send(new SetDefaultCustomerBankAccountCommand(customerId, accountId), ct);
        var result = await Sender.Send(new GetCustomerBankAccountsQuery(customerId), ct);
        return Ok(result);
    }

    // ── DELETE /api/customers/me/bank-accounts/{accountId} ─────────────────────
    [HttpDelete("me/bank-accounts/{accountId:guid}")]
    [Authorize(Roles = "Customer")]
    public async Task<IActionResult> DeleteMyBankAccount(Guid accountId, CancellationToken ct)
    {
        var customerId = GetCustomerIdFromToken();
        await Sender.Send(new DeleteCustomerBankAccountCommand(customerId, accountId), ct);
        var result = await Sender.Send(new GetCustomerBankAccountsQuery(customerId), ct);
        return Ok(result);
    }

    // ── GET /api/customers  (Admin/Operator — all; TenantAdmin — own tenant) ──────────
    [HttpGet]
    [Authorize(Roles = "Admin,Operator,TenantAdmin")]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] string search = "", CancellationToken ct = default)
    {
        // A tenant co-admin sees only their own customers (scope from the JWT claim).
        var result = await Sender.Send(new GetAllCustomersQuery(page, pageSize, search, CurrentTenantId), ct);
        return Ok(result);
    }

    // ── GET /api/customers/{id}  (Admin/Operator — includes company price) ────────────
    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Admin,Operator,Customer")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var dto = await Sender.Send(new GetCustomerByIdQuery(id), ct);
        return Ok(dto);
    }

    // ── PUT /api/customers/{id}/company-price  (Admin only) ──────────────────
    /// <summary>
    /// Sets or updates the tiered per-package delivery prices negotiated with a business customer.
    /// Each tier (Capital / City / District) can be set independently; pass null to revert to the
    /// district's default rate for that tier.
    /// </summary>
    [HttpPut("{id:guid}/company-price")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetCompanyPrice(
        Guid id,
        [FromBody] SetCompanyPriceRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new SetCustomerCompanyPriceCommand(
            id,
            request.CapitalPrice,
            request.CityPrice,
            request.DistrictPrice,
            request.IsCompanyServicePriceIncludedInPrice), ct);
        return NoContent();
    }

    // ── GET /api/customers/{id}/bank-accounts  (Admin/Operator — read-only lookup) ────
    /// <summary>Saved bank accounts for payout lookup, default first. Admins cannot edit these
    /// — only the customer manages their own accounts, via /me/bank-accounts.</summary>
    [HttpGet("{id:guid}/bank-accounts")]
    [Authorize(Roles = "Admin,Operator")]
    public async Task<IActionResult> GetBankAccounts(Guid id, CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerBankAccountsQuery(id), ct);
        return Ok(result);
    }

    // ── GET /api/customers/{id}/special-prices  (Admin/Operator) ──────────────
    /// <summary>Per-district price exceptions on top of the capital/city/district tiers.</summary>
    [HttpGet("{id:guid}/special-prices")]
    [Authorize(Roles = "Admin,Operator")]
    public async Task<IActionResult> GetSpecialPrices(Guid id, CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerSpecialPricesQuery(id), ct);
        return Ok(result);
    }

    // ── PUT /api/customers/{id}/special-prices  (Admin/Operator — upsert one district) ──
    [HttpPut("{id:guid}/special-prices")]
    [Authorize(Roles = "Admin,Operator")]
    public async Task<IActionResult> SetSpecialPrice(
        Guid id, [FromBody] SetSpecialPriceRequest request, CancellationToken ct)
    {
        await Sender.Send(new SetCustomerSpecialPriceCommand(id, request.DistrictId, request.Price), ct);
        var result = await Sender.Send(new GetCustomerSpecialPricesQuery(id), ct);
        return Ok(result);
    }

    // ── DELETE /api/customers/{id}/special-prices/{specialPriceId}  (Admin/Operator) ──
    [HttpDelete("{id:guid}/special-prices/{specialPriceId:guid}")]
    [Authorize(Roles = "Admin,Operator")]
    public async Task<IActionResult> DeleteSpecialPrice(Guid id, Guid specialPriceId, CancellationToken ct)
    {
        await Sender.Send(new DeleteCustomerSpecialPriceCommand(id, specialPriceId), ct);
        var result = await Sender.Send(new GetCustomerSpecialPricesQuery(id), ct);
        return Ok(result);
    }

    // ── PUT /api/customers/{id}  (Admin/Operator — any; TenantAdmin — own tenant's customer) ──
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin,Operator,TenantAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AdminUpdate(
        Guid id, [FromBody] UpdateCustomerRequest request, CancellationToken ct)
    {
        await Sender.Send(new UpdateCustomerCommand(
            id,
            new UpdateCustomerDto(
                request.FirstName, request.LastName, request.IdNumber,
                request.BusinessName, request.PhoneNumber,
                request.City, request.District, request.Address,
                request.Latitude, request.Longitude),
            // Tenant co-admin: guard that the customer is theirs.
            RequireTenantId: CurrentTenantId), ct);
        return NoContent();
    }

    // ── PUT /api/customers/{id}/tenant  (Admin assigns / clears the tenant) ────
    /// <summary>
    /// Assign the customer to a white-label tenant, or pass <c>null</c> to move them
    /// back to the root brand (dilo). Separate from the profile update so a customer's
    /// own profile edit can never change tenant ownership.
    /// </summary>
    [HttpPut("{id:guid}/tenant")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetTenant(
        Guid id, [FromBody] SetCustomerTenantRequest request, CancellationToken ct)
    {
        await Sender.Send(new SetCustomerTenantCommand(id, request.TenantId), ct);
        return NoContent();
    }

    // ── PUT /api/customers/{id}/password  (Admin sets a new password) ─────────
    /// <summary>
    /// Admin override for customers who can't recover their account. Sets a new
    /// password directly without requiring the current one.
    /// </summary>
    [HttpPut("{id:guid}/password")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AdminSetPassword(
        Guid id, [FromBody] AdminSetPasswordRequest request, CancellationToken ct)
    {
        if (request.NewPassword != request.ConfirmNewPassword)
            throw new ValidationException(
                new[] { new FluentValidation.Results.ValidationFailure(
                    "ConfirmNewPassword", "Passwords do not match.") });

        await Sender.Send(new AdminSetCustomerPasswordCommand(id, request.NewPassword), ct);
        return NoContent();
    }

    // ── PUT /api/customers/{id}/active  (Admin/Operator soft-delete / activate) ────────
    [HttpPut("{id:guid}/active")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetActive(
        Guid id, [FromBody] SetCustomerActiveRequest request, CancellationToken ct)
    {
        await Sender.Send(new SetCustomerActiveCommand(id, request.IsActive), ct);
        return NoContent();
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
        string email, string password,
        bool isCompanyServicePriceIncludedInPrice = false,
        Guid? tenantId = null,
        string? registrationHost = null,
        double? latitude = null,
        double? longitude = null) =>
        new(new CreateCustomerDto(firstName, lastName, idNumber,
            businessName, phoneNumber, city, district, address, email, password,
            isCompanyServicePriceIncludedInPrice, tenantId, registrationHost,
            latitude, longitude));
}

// ── Request models ────────────────────────────────────────────────────────────
public sealed record SetCompanyPriceRequest(
    decimal? CapitalPrice,
    decimal? CityPrice,
    decimal? DistrictPrice,
    bool     IsCompanyServicePriceIncludedInPrice = false
);

public sealed record SetSpecialPriceRequest(Guid DistrictId, decimal Price);

public sealed record SecondaryAddressRequest(string Label, string City, string District, string Address);

public sealed record BankAccountRequest(string? Label, string BankName, string AccountHolderName, string AccountNumber);
