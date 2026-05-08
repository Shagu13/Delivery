using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Commands.DeleteDistrict;

public sealed class DeleteDistrictCommandHandler : IRequestHandler<DeleteDistrictCommand>
{
    private readonly IAppDbContext _context;

    public DeleteDistrictCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(DeleteDistrictCommand request, CancellationToken cancellationToken)
    {
        var district = await _context.Districts
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.DateDeleted == null, cancellationToken)
            ?? throw new NotFoundException("District", request.Id);

        district.DateDeleted = DateTime.Now;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
