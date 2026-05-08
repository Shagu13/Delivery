using MediatR;

namespace Application.Cities.Commands.EditDistrict;

public sealed record EditDistrictCommand(Guid Id, string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice) : IRequest;
