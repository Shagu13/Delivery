using Application.Common.Interfaces;
using MediatR;

namespace Application.Addresses.Queries;

public sealed class GetAddressSuggestionsQueryHandler
    : IRequestHandler<GetAddressSuggestionsQuery, IReadOnlyList<AddressSuggestion>>
{
    private readonly IAddressAutocompleteService _service;

    public GetAddressSuggestionsQueryHandler(IAddressAutocompleteService service)
        => _service = service;

    public async Task<IReadOnlyList<AddressSuggestion>> Handle(
        GetAddressSuggestionsQuery request,
        CancellationToken cancellationToken)
    {
        var text = request.Text?.Trim() ?? string.Empty;
        if (text.Length < 3)
            return Array.Empty<AddressSuggestion>();

        return await _service.SuggestAsync(text, request.Lang ?? "en", cancellationToken);
    }
}
