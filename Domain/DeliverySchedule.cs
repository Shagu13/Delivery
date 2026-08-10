namespace Domain;

/// <summary>
/// Which days of the week a City receives deliveries. One row per City — every District
/// under that City (including capital-territory districts) shares its schedule.
/// No row for a City means the schedule has not been configured yet, distinct from a row
/// where all seven flags are false (explicitly no delivery days).
/// </summary>
public class DeliverySchedule
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CityId { get; set; }

    public bool Monday { get; set; }
    public bool Tuesday { get; set; }
    public bool Wednesday { get; set; }
    public bool Thursday { get; set; }
    public bool Friday { get; set; }
    public bool Saturday { get; set; }
    public bool Sunday { get; set; }

    public DateTime CreatedAt { get; set; } = CustomTime.Now;
    public DateTime? DateDeleted { get; set; }
}
