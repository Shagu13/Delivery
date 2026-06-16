using System.Text;
using Application.Common.Security;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace API.Webhooks;

/// <summary>
/// Background worker that drains the webhook outbox: picks up Pending deliveries that
/// are due, POSTs the frozen payload to the partner's URL with an HMAC signature, and
/// records the outcome. Failures are retried with exponential backoff until exhausted.
///
/// Assumes a single running instance (no cross-instance locking). If the app is ever
/// scaled out, add a claim/lease step before sending to avoid duplicate deliveries.
/// </summary>
public sealed class WebhookSenderService : BackgroundService
{
    private const string HttpClientName = "webhooks";
    private const int BatchSize = 50;
    private const int MaxAttempts = 6;
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(15);

    // Backoff applied after attempt N (1-based) fails, before the next try.
    private static readonly TimeSpan[] Backoff =
    [
        TimeSpan.FromMinutes(1),
        TimeSpan.FromMinutes(5),
        TimeSpan.FromMinutes(15),
        TimeSpan.FromMinutes(60),
        TimeSpan.FromMinutes(180),
    ];

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<WebhookSenderService> _logger;

    public WebhookSenderService(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<WebhookSenderService> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Webhook sender batch failed.");
            }

            try
            {
                await Task.Delay(PollInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task ProcessBatchAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var now = DateTime.UtcNow;

        var due = await db.WebhookDeliveries
            .Include(d => d.Webhook)
            .Where(d => d.Status == WebhookDeliveryStatus.Pending && d.NextAttemptAt <= now)
            .OrderBy(d => d.NextAttemptAt)
            .Take(BatchSize)
            .ToListAsync(ct);

        if (due.Count == 0) return;

        var client = _httpClientFactory.CreateClient(HttpClientName);

        foreach (var delivery in due)
        {
            var hook = delivery.Webhook;
            if (hook is null || !hook.IsActive)
            {
                delivery.Status = WebhookDeliveryStatus.Skipped;
                delivery.LastError = "Webhook removed or deactivated before delivery.";
                continue;
            }

            await SendOneAsync(client, delivery, hook.Url, hook.Secret, ct);
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SendOneAsync(
        HttpClient client,
        Domain.WebhookDelivery delivery,
        string url,
        string secret,
        CancellationToken ct)
    {
        delivery.AttemptCount++;
        delivery.LastAttemptAt = DateTime.UtcNow;

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(delivery.PayloadJson, Encoding.UTF8, "application/json"),
            };
            request.Headers.TryAddWithoutValidation("X-Webhook-Signature", WebhookSigner.Sign(secret, delivery.PayloadJson));
            request.Headers.TryAddWithoutValidation("X-Webhook-Event", delivery.EventType);
            request.Headers.TryAddWithoutValidation("X-Webhook-Delivery", delivery.Id.ToString());

            using var response = await client.SendAsync(request, ct);
            delivery.ResponseStatusCode = (int)response.StatusCode;

            if (response.IsSuccessStatusCode)
            {
                delivery.Status = WebhookDeliveryStatus.Delivered;
                delivery.LastError = null;
            }
            else
            {
                ScheduleRetryOrFail(delivery, $"HTTP {(int)response.StatusCode}");
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            delivery.ResponseStatusCode = null;
            ScheduleRetryOrFail(delivery, ex.Message);
        }
    }

    private static void ScheduleRetryOrFail(Domain.WebhookDelivery delivery, string error)
    {
        delivery.LastError = error;

        if (delivery.AttemptCount >= MaxAttempts)
        {
            delivery.Status = WebhookDeliveryStatus.Failed;
            return;
        }

        var backoff = Backoff[Math.Min(delivery.AttemptCount - 1, Backoff.Length - 1)];
        delivery.Status = WebhookDeliveryStatus.Pending;
        delivery.NextAttemptAt = DateTime.UtcNow.Add(backoff);
    }
}
