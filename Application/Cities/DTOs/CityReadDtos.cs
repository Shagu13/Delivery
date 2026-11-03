namespace Application.Cities.DTOs;

// Read models for the /api/cities endpoints. Shapes and property order mirror the response
// records CitiesController used to build inline, so the camelCased JSON is unchanged.

public sealed record CityDto(Guid Id, string CityName, string? CityNameGeo);

public sealed record DistrictDto(
    Guid Id, string DistrictName, string? DistrictNameGeo,
    decimal? CompanyServicePrice, bool IsCapitalTerritory, bool IsCityTerritory);

/// <summary>
/// One active district with its parent city and the city's delivery schedule — the price
/// calculator's "To" picker. <see cref="ScheduleSet"/> is false when the city was never
/// configured (the day flags are then all false and meaningless).
/// </summary>
public sealed record AllDistrictDto(
    Guid DistrictId, string DistrictName, string? DistrictNameGeo,
    Guid CityId, string CityName, string? CityNameGeo,
    decimal? CompanyServicePrice, bool IsCapitalTerritory, bool IsCityTerritory,
    bool ScheduleSet, bool Monday, bool Tuesday, bool Wednesday, bool Thursday, bool Friday, bool Saturday, bool Sunday);

/// <summary>
/// Which days of the week a city receives deliveries. <see cref="ScheduleSet"/> is false when the
/// city has never been configured — callers should show "not set" rather than "no days".
/// </summary>
public sealed record DeliveryScheduleDto(
    bool ScheduleSet, bool Monday, bool Tuesday, bool Wednesday, bool Thursday, bool Friday, bool Saturday, bool Sunday);
