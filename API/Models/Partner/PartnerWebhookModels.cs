namespace API.Models.Partner;

public sealed record CreatePartnerWebhookRequest(Guid CustomerId, string Url);
