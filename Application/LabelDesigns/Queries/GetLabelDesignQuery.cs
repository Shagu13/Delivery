using Application.Common.Interfaces;
using Application.LabelDesigns.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.LabelDesigns.Queries;

/// <summary>The caller's saved label settings, or null when they have never saved any.</summary>
public sealed record GetLabelDesignQuery(string UserId) : IRequest<LabelDesignDto?>;

public sealed class GetLabelDesignQueryHandler : IRequestHandler<GetLabelDesignQuery, LabelDesignDto?>
{
    private readonly IAppDbContext _context;
    public GetLabelDesignQueryHandler(IAppDbContext context) => _context = context;

    public async Task<LabelDesignDto?> Handle(GetLabelDesignQuery request, CancellationToken cancellationToken)
    {
        return await _context.LabelDesigns
            .AsNoTracking()
            .Where(d => d.OwnerUserId == request.UserId)
            .Select(d => new LabelDesignDto(d.PrefsJson))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
