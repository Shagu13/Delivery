namespace Application.PartnerWebhooks;

/// <summary>
/// Cache key for "does any active partner webhook exist". <c>WebhookOutboxInterceptor</c> reads it
/// on every order status change to skip its extra DB round trips when nobody subscribes; the
/// create/deactivate webhook handlers remove it so a change takes effect immediately.
/// </summary>
public static class WebhookCacheKeys
{
    public const string AnyActive = "webhooks:any-active";
}
