using MediatR;

namespace Application.Cities.Commands.SetDeliverySchedule;

public sealed record SetCityDeliveryScheduleCommand(
    Guid CityId,
    bool Monday, bool Tuesday, bool Wednesday, bool Thursday, bool Friday, bool Saturday, bool Sunday
) : IRequest<SetCityDeliveryScheduleResult>;

public sealed record SetCityDeliveryScheduleResult(
    Guid CityId,
    bool Monday, bool Tuesday, bool Wednesday, bool Thursday, bool Friday, bool Saturday, bool Sunday
);
