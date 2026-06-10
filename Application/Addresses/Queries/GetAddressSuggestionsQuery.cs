using Application.Common.Interfaces;
using MediatR;

namespace Application.Addresses.Queries;

/// <summary>
/// Proxies an address autocomplete lookup through the backend so the
/// geocoding provider's API key stays server-side.
/// </summary>
public sealed record GetAddressSuggestionsQuery(string Text, string Lang)
    : IRequest<IReadOnlyList<AddressSuggestion>>;
