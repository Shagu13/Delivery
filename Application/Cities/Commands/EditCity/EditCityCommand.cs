using MediatR;

namespace Application.Cities.Commands.EditCity;

public sealed record EditCityCommand(Guid Id, string CityName, string? CityNameGeo) : IRequest;
