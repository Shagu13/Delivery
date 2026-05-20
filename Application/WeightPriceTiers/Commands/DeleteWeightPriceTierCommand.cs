using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.WeightPriceTiers.Commands;

// ── Command ───────────────────────────────────────────────────────────────────

public sealed record DeleteWeightPriceTierCommand(Guid Id) : IRequest;

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class DeleteWeightPriceTierCommandHandler
    : IRequestHandler<DeleteWeightPriceTierCommand>
{
    private readonly IAppDbContext _context;

    public DeleteWeightPriceTierCommandHandler(IAppDbContext context)
        => _context = context;

    public async Task Handle(
        DeleteWeightPriceTierCommand request,
        CancellationToken cancellationToken)
    {
        var tier = await _context.WeightPriceTiers
            .FirstOrDefaultAsync(t => t.Id == request.Id && t.DateDeleted == null, cancellationToken)
            ?? throw new NotFoundException(nameof(WeightPriceTier), request.Id);

        tier.DateDeleted = DateTime.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);
    }
}