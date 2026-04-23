using Application.Common.Exceptions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;
using System.Text.Json;

namespace API.Middleware;


/// <summary>
/// Global exception filter — converts domain exceptions to RFC 7807 ProblemDetails responses.
/// Placed at the top of the pipeline so every unhandled exception is caught.
/// </summary>
public sealed class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly IHostEnvironment _env;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger, IHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception for {Method} {Path}",
                context.Request.Method, context.Request.Path);
            await HandleAsync(context, ex, _env.IsDevelopment());
        }
    }

    private static async Task HandleAsync(HttpContext context, Exception exception, bool isDevelopment)
    {
        var (status, title, errors) = exception switch
        {
            NotFoundException e      => (404, e.Message,  (IDictionary<string, string[]>?)null),
            ValidationException e    => (422, "One or more validation errors occurred.", e.Errors),
            ForbiddenException e     => (403, e.Message,  null),
            ConflictException e      => (409, e.Message,  null),
            _                        => (500, "An unexpected error occurred.", null)
        };

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Instance = context.Request.Path
        };

        if (errors is not null)
            problem.Extensions["errors"] = errors;

        if (isDevelopment && status == 500)
        {
            problem.Detail = exception.ToString();
        }

        context.Response.StatusCode = status;
        context.Response.ContentType = "application/problem+json";

        await context.Response.WriteAsync(
            JsonSerializer.Serialize(problem, JsonOptions));
    }
}
