using FluentValidation;

namespace Application.Common.Validation;

/// <summary>
/// Single source of truth for password-complexity rules, kept in lock-step with
/// ASP.NET Identity's <c>PasswordOptions</c> (configured in Persistence). Applying
/// these here lets unmet rules surface as friendly field-level validation errors
/// (HTTP 422) instead of opaque Identity errors. The frontend mirrors the same
/// rules so users see translated warnings before submitting.
/// </summary>
public static class PasswordRules
{
    public static IRuleBuilderOptions<T, string> ApplyPasswordRules<T>(
        this IRuleBuilder<T, string> rule) =>
        rule
            .NotEmpty().WithMessage("Password is required.")
            .MinimumLength(8).WithMessage("Password must be at least 8 characters.")
            .MaximumLength(100).WithMessage("Password must be at most 100 characters.")
            .Matches("[A-Z]").WithMessage("Password must contain at least one uppercase letter.")
            .Matches("[a-z]").WithMessage("Password must contain at least one lowercase letter.")
            .Matches("[0-9]").WithMessage("Password must contain at least one number.")
            .Matches("[^a-zA-Z0-9]").WithMessage("Password must contain at least one symbol.");
}
