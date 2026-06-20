namespace Domain
{
    /// <summary>
    /// Provides the current date and time in Georgian Standard Time (UTC+4).
    /// Use this instead of DateTime.Now / DateTime.UtcNow throughout the application
    /// so that timestamps are always correct regardless of where the server is hosted
    /// (e.g. Azure App Service runs in UTC, not local time).
    /// </summary>
    public static class CustomTime
    {
        // .NET 6+ resolves both Windows ("Georgian Standard Time") and IANA
        // ("Asia/Tbilisi") ids on every platform, but fall back just in case.
        private static readonly TimeZoneInfo Zone = ResolveZone();

        private static TimeZoneInfo ResolveZone()
        {
            foreach (var id in new[] { "Georgian Standard Time", "Asia/Tbilisi" })
            {
                try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
                catch (TimeZoneNotFoundException) { }
                catch (InvalidTimeZoneException) { }
            }
            // Last resort: fixed UTC+4 (Georgia has no daylight saving).
            return TimeZoneInfo.CreateCustomTimeZone("GET", TimeSpan.FromHours(4), "Georgian Standard Time", "Georgian Standard Time");
        }

        /// <summary>Current date and time in Georgian Standard Time.</summary>
        public static DateTime Now => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Zone);

        /// <summary>Current date (no time component) in Georgian Standard Time.</summary>
        public static DateTime Today => Now.Date;
    }
}
