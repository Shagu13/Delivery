using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.WeightPriceTiers.DTOs;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.WeightPriceTiers.Commands;

// ── Command ───────────────────────────────────────────────────────────────────

public sealed record UpdateWeightPriceTierCommand(
    Guid Id,
    string? Label,
    decimal MinWeightKg,
    decimal MaxWeightKg,
    bool IsStandard,
    decimal? CustomPrice
) : IRequest<WeightPriceTierDto>;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class UpdateWeightPriceTierCommandValidator
    : AbstractValidator<UpdateWeightPriceTierCommand>
{
    public UpdateWeightPriceTierCommandValidator()
    {
        RuleFor(x => x.MinWeightKg)
            .GreaterThanOrEqualTo(0).WithMessage("Minimum weight must be 0 or more.");

        RuleFor(x => x.MaxWeightKg)
            .GreaterThan(x => x.MinWeightKg)
            .WithMessage("Maximum weight must be greater than minimum weight.");

        RuleFor(x => x.Label)
            .MaximumLength(100).WithMessage("Label must not exceed 100 characters.")
            .When(x => x.Label is not null);

        RuleFor(x => x.CustomPrice)
            .NotNull().WithMessage("Custom price is required when IsStandard is false.")
            .GreaterThan(0).WithMessage("Custom price must be greater than 0.")
            .When(x => !x.IsStandard);

        RuleFor(x => x.CustomPrice)
            .Null().WithMessage("Custom price must be empty when IsStandard is true.")
            .When(x => x.IsStandard);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class UpdateWeightPriceTierCommandHandler
    : IRequestHandler<UpdateWeightPriceTierCommand, WeightPriceTierDto>
{
    private readonly IAppDbContext _context;

    public UpdateWeightPriceTierCommandHandler(IAppDbContext context)
        => _context = context;

    public async Task<WeightPriceTierDto> Handle(
        UpdateWeightPriceTierCommand request,
        CancellationToken cancellationToken)
    {
        var tier = await _context.WeightPriceTiers
            .FirstOrDefaultAsync(t => t.Id == request.Id && t.DateDeleted == null, cancellationToken)
            ?? throw new NotFoundException(nameof(WeightPriceTier), request.Id);

        tier.Label = request.Label?.Trim();
        tier.MinWeightKg = request.MinWeightKg;
        tier.MaxWeightKg = request.MaxWeightKg;
        tier.IsStandard = request.IsStandard;
        tier.CustomPrice = request.IsStandard ? null : request.CustomPrice;

        await _context.SaveChangesAsync(cancellationToken);

        return new WeightPriceTierDto(
            tier.Id,
            tier.Label,
            tier.MinWeightKg,
            tier.MaxWeightKg,
            tier.IsStandard,
            tier.CustomPrice,
            tier.CreatedAt);
    }
}