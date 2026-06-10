namespace Application.Common.Interfaces;

/// <summary>
/// Server-side address autocomplete gateway. The provider's API key is
/// resolved internally from configuration, so it never reaches the browser.
/// </summary>
public interface IAddressAutocompleteService
{
    /// <summary>
    /// Returns address suggestions for the given free-text query.
    /// <paramref name="lang"/> is "ka" or "en". Returns an empty list when
    /// no API key is configured or the upstream call fails.
    /// </summary>
    Task<IReadOnlyList<AddressSuggestion>> SuggestAsync(
        string text,
        string lang,
        CancellationToken cancellationToken = default);
}

/// <summary>A single autocomplete result. Returned directly to the client.</summary>
public sealed record AddressSuggestion(
    string Formatted,
    string? AddressLine1,
    string? AddressLine2,
    double? Lat,
    double? Lon);
