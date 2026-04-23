using MediatR;
using Microsoft.Extensions.Logging;

namespace Application.Common.Behaviors;

/// <summary>
/// Outermost pipeline behavior — logs every request and its outcome.
/// Placed first so it wraps Validation and Caching behaviors.
/// </summary>
public sealed class LoggingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly ILogger<LoggingBehavior<TRequest, TResponse>> _logger;

    public LoggingBehavior(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
        => _logger = logger;

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var name = typeof(TRequest).Name;
        _logger.LogInformation("[START] {Request}", name);

        try
        {
            var response = await next();
            _logger.LogInformation("[END] {Request}", name);
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FAIL] {Request}", name);
            throw;
        }
    }
}
