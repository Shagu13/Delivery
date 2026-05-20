using Application.Common.Interfaces;
using Application.WeightPriceTiers.Commands;
using Application.WeightPriceTiers.DTOs;
using Domain;
using MediatR;

namespace Application.WeightPriceTiers.Commands;

public sealed class CreateWeightPriceTierCommandHandler
    : IRequestHandler<CreateWeightPriceTierCommand, WeightPriceTierDto>
{
    private readonly IAppDbContext _context;

    public CreateWeightPriceTierCommandHandler(IAppDbContext context)
        => _context = context;

    public async Task<WeightPriceTierDto> Handle(
        CreateWeightPriceTierCommand request,
        CancellationToken cancellationToken)
    {
        var tier = new WeightPriceTier
        {
            Label        = request.Label?.Trim(),
            MinWeightKg  = request.MinWeightKg,
            MaxWeightKg  = request.MaxWeightKg,
            IsStandard   = request.IsStandard,
            CustomPrice  = request.IsStandard ? null : request.CustomPrice,
        };

        _context.WeightPriceTiers.Add(tier);
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
