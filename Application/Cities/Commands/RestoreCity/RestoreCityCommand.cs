using MediatR;

namespace Application.Cities.Commands.RestoreCity;

public sealed record RestoreCityCommand(Guid Id) : IRequest;
