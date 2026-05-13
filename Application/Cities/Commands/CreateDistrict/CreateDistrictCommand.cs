using MediatR;

namespace Application.Cities.Commands.CreateDistrict;

public sealed record CreateDistrictCommand(Guid CityId, string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice, bool IsCapitalTerritory, bool IsCityTerritory) : IRequest<CreateDistrictResult>;

public sealed record CreateDistrictResult(Guid Id, string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice, bool IsCapitalTerritory, bool IsCityTerritory);
