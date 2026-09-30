namespace API.Models.Orders;

public sealed record ScanExportRequest(IReadOnlyList<string> TrackingNumbers, Guid? CourierId, string Lang = "en");
