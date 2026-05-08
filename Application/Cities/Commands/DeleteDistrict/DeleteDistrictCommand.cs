using MediatR;

namespace Application.Cities.Commands.DeleteDistrict;

public sealed record DeleteDistrictCommand(Guid Id) : IRequest;
