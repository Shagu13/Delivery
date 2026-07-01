using Application.Push;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Web Push subscription management + VAPID key exposure/generation for the courier
/// "new order" notifications that show even when the app is closed.
/// </summary>
public sealed class PushController : BaseController
{
    // ── GET /api/push/vapid-public-key  (any signed-in user; client needs it to subscribe) ──
    [HttpGet("vapid-public-key")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetVapidPublicKey(CancellationToken ct)
    {
        var key = await Sender.Send(new GetVapidPublicKeyQuery(), ct);
        return Ok(new { publicKey = key });
    }

    // ── POST /api/push/subscribe  (Courier registers a device) ────────────────
    [HttpPost("subscribe")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Subscribe([FromBody] PushSubscribeRequest req, CancellationToken ct)
    {
        await Sender.Send(new SavePushSubscriptionCommand(CurrentCourierId, req.Endpoint, req.P256dh, req.Auth), ct);
        return NoContent();
    }

    // ── POST /api/push/unsubscribe  (Courier disables notifications) ───────────
    [HttpPost("unsubscribe")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Unsubscribe([FromBody] PushUnsubscribeRequest req, CancellationToken ct)
    {
        await Sender.Send(new DeletePushSubscriptionCommand(req.Endpoint), ct);
        return NoContent();
    }

    // ── GET /api/push/generate-vapid-keys  (Admin, one-time setup) ────────────
    // Returns a fresh keypair to copy into config. It does NOT read/expose the current keys.
    [HttpGet("generate-vapid-keys")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GenerateVapidKeys(CancellationToken ct)
    {
        var keys = await Sender.Send(new GenerateVapidKeysQuery(), ct);
        return Ok(keys);
    }
}

public sealed record PushSubscribeRequest(string Endpoint, string P256dh, string Auth);
public sealed record PushUnsubscribeRequest(string Endpoint);
