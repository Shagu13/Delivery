namespace API.Models.Partner;

public sealed record IssuePartnerApiKeyRequest(Guid CustomerId, string Name);
