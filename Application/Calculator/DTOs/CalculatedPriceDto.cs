namespace Application.Calculator.DTOs;

/// <summary>
/// Result of the public price calculator. <see cref="Tier"/> names which rule set the price:
/// "default", "special", "capital", "city" or "district" (a weight tier overrides the price
/// but keeps the tier label of the rule it replaced).
/// </summary>
public sealed record CalculatedPriceDto(decimal Price, string Tier);
