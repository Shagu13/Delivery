using MediatR;

namespace Application.Cities.Commands.RestoreDistrict;

public sealed record RestoreDistrictCommand(Guid Id) : IRequest;
