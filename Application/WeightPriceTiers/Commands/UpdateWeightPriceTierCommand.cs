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
    Guid     Id,
    string?  Label,
    decimal  MinWeightKg,
    decimal  MaxWeightKg,
    decimal? CapitalPrice,
    decimal? CityPrice,
    decimal? DistrictPrice
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

        RuleFor(x => x.CapitalPrice)
            .GreaterThan(0).WithMessage("Capital price must be greater than 0.")
            .When(x => x.CapitalPrice.HasValue);

        RuleFor(x => x.CityPrice)
            .GreaterThan(0).WithMessage("City price must be greater than 0.")
            .When(x => x.CityPrice.HasValue);

        RuleFor(x => x.DistrictPrice)
            .GreaterThan(0).WithMessage("District price must be greater than 0.")
            .When(x => x.DistrictPrice.HasValue);
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

        tier.Label         = request.Label?.Trim();
        tier.MinWeightKg   = request.MinWeightKg;
        tier.MaxWeightKg   = request.MaxWeightKg;
        tier.CapitalPrice  = request.CapitalPrice;
        tier.CityPrice     = request.CityPrice;
        tier.DistrictPrice = request.DistrictPrice;

        await _context.SaveChangesAsync(cancellationToken);

        return new WeightPriceTierDto(
            tier.Id,
            tier.Label,
            tier.MinWeightKg,
            tier.MaxWeightKg,
            tier.CapitalPrice,
            tier.CityPrice,
            tier.DistrictPrice,
            tier.CreatedAt);
    }
}
