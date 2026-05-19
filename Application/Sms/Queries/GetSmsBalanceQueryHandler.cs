using Application.Common.Interfaces;
using MediatR;
using Microsoft.Extensions.Logging;

namespace Application.Sms.Queries;

public sealed class GetSmsBalanceQueryHandler
    : IRequestHandler<GetSmsBalanceQuery, int>
{
    private readonly ISmsService _smsService;
    private readonly ILogger<GetSmsBalanceQueryHandler> _logger;

    public GetSmsBalanceQueryHandler(
        ISmsService smsService,
        ILogger<GetSmsBalanceQueryHandler> logger)
    {
        _smsService = smsService;
        _logger     = logger;
    }

    public async Task<int> Handle(
        GetSmsBalanceQuery request,
        CancellationToken cancellationToken)
    {
        var result = await _smsService.GetSmsBalanceAsync(cancellationToken);

        if (result.IsSuccess)
        {
            if (int.TryParse(result.Value, out var balance))
            {
                _logger.LogInformation("SMS balance fetched: {Balance} credits", balance);
                return balance;
            }

            _logger.LogWarning("SMS balance response was not a valid integer: {Value}", result.Value);
            return 0;
        }

        // Log the error but return 0 — the dashboard should still load
        _logger.LogError("Failed to fetch SMS balance: {Error}", result.Error);
        return 0;
    }
}
