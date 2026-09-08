using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Push;

// ── Commands / queries ────────────────────────────────────────────────────────────
/// <summary>Courier registers (or refreshes) a device's Web Push subscription.</summary>
public sealed record SavePushSubscriptionCommand(Guid CourierId, string Endpoint, string P256dh, string Auth) : IRequest;

/// <summary>Remove a Web Push subscription (courier disabled notifications / unsubscribed).</summary>
public sealed record DeletePushSubscriptionCommand(string Endpoint) : IRequest;

/// <summary>The configured VAPID public key the client needs to create a subscription.</summary>
public sealed record GetVapidPublicKeyQuery() : IRequest<string?>;

public sealed record VapidKeysDto(string PublicKey, string PrivateKey);

/// <summary>Generate a fresh VAPID keypair for one-time setup (admin).</summary>
public sealed record GenerateVapidKeysQuery() : IRequest<VapidKeysDto>;

// ── Validators ────────────────────────────────────────────────────────────────────
public sealed class SavePushSubscriptionCommandValidator : AbstractValidator<SavePushSubscriptionCommand>
{
    public SavePushSubscriptionCommandValidator()
    {
        RuleFor(x => x.CourierId).NotEmpty();
        RuleFor(x => x.Endpoint)
            .NotEmpty()
            .Must(e => Uri.TryCreate(e, UriKind.Absolute, out _))
            .WithMessage("Endpoint must be an absolute URL.");
        RuleFor(x => x.P256dh).NotEmpty();
        RuleFor(x => x.Auth).NotEmpty();
    }
}

// ── Handlers ──────────────────────────────────────────────────────────────────────
public sealed class SavePushSubscriptionHandler : IRequestHandler<SavePushSubscriptionCommand>
{
    private readonly IAppDbContext _db;
    public SavePushSubscriptionHandler(IAppDbContext db) => _db = db;

    public async Task Handle(SavePushSubscriptionCommand r, CancellationToken ct)
    {
        // Keyed by endpoint (one per device). Re-subscribing updates the owning courier + keys.
        var existing = await _db.PushSubscriptions.FirstOrDefaultAsync(s => s.Endpoint == r.Endpoint, ct);
        if (existing is null)
        {
            _db.PushSubscriptions.Add(new PushSubscription
            {
                Id = Guid.NewGuid(),
                CourierId = r.CourierId,
                Endpoint = r.Endpoint,
                P256dh = r.P256dh,
                Auth = r.Auth,
                CreatedAt = CustomTime.Now,
            });
        }
        else
        {
            existing.CourierId = r.CourierId;
            existing.P256dh = r.P256dh;
            existing.Auth = r.Auth;
        }
        await _db.SaveChangesAsync(ct);
    }
}

public sealed class DeletePushSubscriptionHandler : IRequestHandler<DeletePushSubscriptionCommand>
{
    private readonly IAppDbContext _db;
    public DeletePushSubscriptionHandler(IAppDbContext db) => _db = db;

    public async Task Handle(DeletePushSubscriptionCommand r, CancellationToken ct)
    {
        var subs = await _db.PushSubscriptions.Where(s => s.Endpoint == r.Endpoint).ToListAsync(ct);
        if (subs.Count == 0) return;
        _db.PushSubscriptions.RemoveRange(subs);
        await _db.SaveChangesAsync(ct);
    }
}

public sealed class GetVapidPublicKeyHandler : IRequestHandler<GetVapidPublicKeyQuery, string?>
{
    private readonly IWebPushService _push;
    public GetVapidPublicKeyHandler(IWebPushService push) => _push = push;
    public Task<string?> Handle(GetVapidPublicKeyQuery r, CancellationToken ct) => Task.FromResult(_push.PublicKey);
}

public sealed class GenerateVapidKeysHandler : IRequestHandler<GenerateVapidKeysQuery, VapidKeysDto>
{
    private readonly IWebPushService _push;
    public GenerateVapidKeysHandler(IWebPushService push) => _push = push;
    public Task<VapidKeysDto> Handle(GenerateVapidKeysQuery r, CancellationToken ct)
    {
        var (pub, priv) = _push.GenerateKeys();
        return Task.FromResult(new VapidKeysDto(pub, priv));
    }
}
