namespace Application.LabelDesigns.DTOs;

/// <summary>A user's saved label print settings. <see cref="PrefsJson"/> is client-owned JSON.</summary>
public sealed record LabelDesignDto(string PrefsJson);
