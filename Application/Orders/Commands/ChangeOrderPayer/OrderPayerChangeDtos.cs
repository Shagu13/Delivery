using Application.Finance;
using Domain.Enums;

namespace Application.Orders.Commands.ChangeOrderPayer;

/// <summary>One field the payer change will modify, as invariant-formatted text (numbers "12.50", enums by name).</summary>
public sealed record PayerChangeLine(string Field, string? Before, string? After);

/// <summary>
/// A consequence the admin should know about before confirming. <paramref name="Code"/> is a stable key the
/// client maps to translated copy; <paramref name="Amount"/> is the money involved.
/// </summary>
public sealed record PayerChangeWarning(string Code, decimal Amount);

/// <summary>What <c>ChangeOrderPayerCommand</c> would do (or just did) to an order.</summary>
public sealed record PayerChangePreviewDto(
    ServicePayer CurrentPayer,
    ServicePayer NewPayer,
    /// <summary>Fee resolved from the customer's special price / negotiated rate / district default. Null when none exists.</summary>
    decimal? SuggestedFee,
    OrderFeeSource SuggestedFeeSource,
    /// <summary>The fee the lines below were computed with. Null until the admin supplies one and no suggestion exists.</summary>
    decimal? AppliedFee,
    IReadOnlyList<PayerChangeLine> Lines,
    IReadOnlyList<PayerChangeWarning> Warnings);
