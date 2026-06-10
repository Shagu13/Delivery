using Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace Infrastructure.Geocoding;

/// <summary>
/// Address autocomplete backed by Geoapify's Geocoding API.
/// Reads the key from configuration ("Geoapify:ApiKey") so it stays
/// server-side and never ships to the browser. Results are biased to Georgia.
///
/// Config key expected:
///   "Geoapify:ApiKey"  — set via Azure App Settings (Geoapify__ApiKey) in prod,
///                        or user-secrets / appsettings.Development.json locally.
/// </summary>
public sealed class GeoapifyAddressService : IAddressAutocompleteService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<GeoapifyAddressService> _logger;
    private readonly string? _apiKey;
    private const string BaseUrl = "https://api.geoapify.com/v1/geocode/autocomplete";

    public GeoapifyAddressService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<GeoapifyAddressService> logger)
    {
        _httpClient = httpClient;
        _logger     = logger;
        _apiKey     = configuration["Geoapify:ApiKey"];
    }

    public async Task<IReadOnlyList<AddressSuggestion>> SuggestAsync(
        string text,
        string lang,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            _logger.LogWarning("Geoapify:ApiKey is not configured — address autocomplete is disabled.");
            return Array.Empty<AddressSuggestion>();
        }

        var query = text.Trim();
        var safeLang = lang is "ka" or "en" ? lang : "en";

        var url =
            $"{BaseUrl}?text={Uri.EscapeDataString(query)}" +
            $"&apiKey={_apiKey}" +
            "&filter=countrycode:ge" +
            $"&lang={safeLang}" +
            "&limit=6&format=json";

        try
        {
            using var response = await _httpClient.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Geoapify autocomplete failed. Status={Status}", response.StatusCode);
                return Array.Empty<AddressSuggestion>();
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            if (!doc.RootElement.TryGetProperty("results", out var results) ||
                results.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<AddressSuggestion>();
            }

            var list = new List<AddressSuggestion>(results.GetArrayLength());
            foreach (var r in results.EnumerateArray())
            {
                var formatted = GetString(r, "formatted");
                if (string.IsNullOrWhiteSpace(formatted)) continue;

                list.Add(new AddressSuggestion(
                    formatted,
                    GetString(r, "address_line1"),
                    GetString(r, "address_line2"),
                    GetDouble(r, "lat"),
                    GetDouble(r, "lon")));
            }

            return list;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The browser aborted this lookup — typically the user typed another
            // character and the previous request was superseded. Expected; not an error.
            return Array.Empty<AddressSuggestion>();
        }
        catch (Exception ex)
        {
            // Real failure (network error, upstream timeout, bad response).
            _logger.LogError(ex, "Error calling Geoapify autocomplete.");
            return Array.Empty<AddressSuggestion>();
        }
    }

    private static string? GetString(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static double? GetDouble(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
}
