using System.Security.Claims;
using API.Auth;
using API.Models.Partner;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.CreateGroupOrder;
using Application.GroupOrders.DTOs;
using Application.PartnerOrders;
using Application.PartnerOrders.DTOs;
using Application.PartnerOrders.Queries.GetPartnerOrder;
using Application.PartnerOrders.Queries.GetPartnerOrders;
using Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

/// <summary>
/// Partner-facing order intake. Authenticated by an API key (not a JWT): the key
/// resolves to the owning Customer, and each request is turned into a normal
/// GroupOrder so it flows through the same pickup → delivery → settlement pipeline
/// as web/admin orders. Orders land as Pending for admin review.
/// </summary>
[Authorize(AuthenticationSchemes = ApiKeyAuthenticationHandler.SchemeName)]
public sealed class PartnerOrdersController : BaseController
{
    // ── POST /api/partner/orders ───────────────────────────────────────────────
    [HttpPost("/api/partner/orders")]
    [ProducesResponseType(typeof(PartnerOrderResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Place([FromBody] PartnerOrderRequest request, CancellationToken ct)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Unauthorized();

        if (request.Orders is null || request.Orders.Count == 0)
            return UnprocessableEntity(new { title = "At least one order is required." });

        var db = HttpContext.RequestServices.GetRequiredService<IAppDbContext>();

        // ── Resolve the partner (Customer) for sender/pickup fallback ──────────
        var customer = await db.Customers.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == customerId, ct);
        if (customer is null)
            return Unauthorized();

        // ── De-duplicate by the partner's own order numbers ───────────────────
        var refs = request.Orders
            .Select(o => o.ExternalReference)
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Select(r => r!.Trim())
            .Distinct()
            .ToList();

        if (refs.Count > 0)
        {
            var existing = await db.Orders.AsNoTracking()
                .Where(o => o.ExternalReference != null
                    && refs.Contains(o.ExternalReference)
                    && (o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId))
                .Select(o => o.ExternalReference!)
                .ToListAsync(ct);

            if (existing.Count > 0)
                return Conflict(new
                {
                    title = "Duplicate order number(s) — these have already been submitted.",
                    duplicates = existing
                });
        }

        // ── City/district normalisation (accept Georgian or English names) ─────
        var (cityGeoToEn, districtGeoToEn, capitalDistrictByCity) = await LoadLocationMapsAsync(db, ct);

        var orderDtos = request.Orders.Select(o =>
        {
            var city = cityGeoToEn.TryGetValue(o.RecipientCity.Trim(), out var enCity)
                ? enCity : o.RecipientCity.Trim();
            var district = districtGeoToEn.TryGetValue(o.RecipientDistrict?.Trim() ?? "", out var enDist)
                ? enDist : o.RecipientDistrict?.Trim() ?? "";

            // Capital city (e.g. Tbilisi): district optional → bind a capital district for pricing.
            if (string.IsNullOrWhiteSpace(district)
                && capitalDistrictByCity.TryGetValue(city, out var capitalDist))
            {
                district = capitalDist;
            }

            return new CreateOrderDto(
                RecipientName:             o.RecipientName,
                RecipientPhone:            o.RecipientPhone,
                RecipientCity:             city,
                RecipientDistrict:         district,
                RecipientAddress:          o.RecipientAddress,
                Description:               o.Description,
                IsFragile:                 o.IsFragile,
                ProductPaymentStatus:      o.ProductPaymentStatus,
                WhoPaysForCompanyService:  o.WhoPaysForCompanyService,
                OrderType:                 OrderType.Send,   // Send only in this version
                AmountToCollectForPackage: o.AmountToCollectForPackage,
                CompanyServicePrice:       o.CompanyServicePrice,
                ExternalReference:         string.IsNullOrWhiteSpace(o.ExternalReference)
                                               ? null : o.ExternalReference.Trim());
        }).ToList();

        // ── Sender/pickup: use request values, else fall back to partner profile ─
        var dto = new CreateGroupOrderDto(
            SenderFirstName:        Coalesce(request.SenderFirstName,    customer.FirstName),
            SenderLastName:         Coalesce(request.SenderLastName,     customer.LastName),
            SenderIdNumber:         request.SenderIdNumber ?? customer.IdNumber,
            SenderBusinessName:     Coalesce(request.SenderBusinessName, customer.BusinessName),
            SenderPhone:            Coalesce(request.SenderPhone,        customer.PhoneNumber),
            AlternativeSenderPhone: null,
            PickUpCity:             Coalesce(request.PickUpCity,     customer.City),
            PickUpDistrict:         Coalesce(request.PickUpDistrict, customer.District),
            PickUpAddress:          Coalesce(request.PickUpAddress,  customer.Address),
            Note:                   request.Note,
            Orders:                 orderDtos,
            CustomerId:             customerId);

        var result = await Sender.Send(new CreateGroupOrderCommand(dto), ct);

        // Re-attach each partner reference by position (Send-only preserves order).
        var items = result.Orders
            .Select((r, i) => new PartnerOrderResultItem(
                r.TrackingNumber,
                i < orderDtos.Count ? orderDtos[i].ExternalReference : null,
                r.RecipientName))
            .ToList();

        return StatusCode(StatusCodes.Status201Created,
            new PartnerOrderResponse(result.GroupOrderId, items));
    }

    // ── GET /api/partner/orders  — list the partner's own orders ───────────────
    [HttpGet("/api/partner/orders")]
    [ProducesResponseType(typeof(PartnerOrderListDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> List(
        [FromQuery] PartnerOrderStatus? status,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Unauthorized();

        var result = await Sender.Send(
            new GetPartnerOrdersQuery(customerId, status, search, page, pageSize), ct);
        return Ok(result);
    }

    // ── GET /api/partner/orders/{reference}  — one order by TN or external ref ──
    [HttpGet("/api/partner/orders/{reference}")]
    [ProducesResponseType(typeof(PartnerOrderDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetOne(string reference, CancellationToken ct)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Unauthorized();

        var result = await Sender.Send(new GetPartnerOrderQuery(customerId, reference), ct);
        return Ok(result);
    }

    private static string Coalesce(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static async Task<(
        Dictionary<string, string> CityGeoToEn,
        Dictionary<string, string> DistrictGeoToEn,
        Dictionary<string, string> CapitalDistrictByCity)>
        LoadLocationMapsAsync(IAppDbContext db, CancellationToken ct)
    {
        var cities = await db.Cities.AsNoTracking()
            .Where(c => c.DateDeleted == null)
            .Select(c => new { c.CityName, c.CityNameGeo })
            .ToListAsync(ct);

        var cityGeoToEn = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var c in cities)
            if (!string.IsNullOrWhiteSpace(c.CityNameGeo))
                cityGeoToEn[c.CityNameGeo!] = c.CityName;

        var districts = await db.Districts.AsNoTracking()
            .Where(d => d.DateDeleted == null)
            .Select(d => new { d.DistrictName, d.DistrictNameGeo })
            .ToListAsync(ct);

        var districtGeoToEn = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var d in districts)
            if (!string.IsNullOrWhiteSpace(d.DistrictNameGeo))
                districtGeoToEn[d.DistrictNameGeo!] = d.DistrictName;

        var capitalDistrictByCity = await db.Districts.AsNoTracking()
            .Where(d => d.DateDeleted == null && d.IsCapitalTerritory)
            .GroupBy(d => d.City.CityName)
            .Select(g => new { CityName = g.Key, DistrictName = g.Min(d => d.DistrictName) })
            .ToDictionaryAsync(x => x.CityName, x => x.DistrictName!, StringComparer.OrdinalIgnoreCase, ct);

        return (cityGeoToEn, districtGeoToEn, capitalDistrictByCity);
    }
}
