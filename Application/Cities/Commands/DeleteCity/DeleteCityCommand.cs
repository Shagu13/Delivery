using MediatR;

namespace Application.Cities.Commands.DeleteCity;

public sealed record DeleteCityCommand(Guid Id) : IRequest;
