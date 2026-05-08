using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCityLevelDistrictRows : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Insert one city-level district row per city where one doesn't already exist.
            // This allows orders with RecipientDistrict == CityName to be matched and
            // identified as city-level deliveries (district.DistrictName == district.City.CityName).
            migrationBuilder.Sql(@"
                INSERT INTO Districts (Id, DistrictName, CityId, CreatedAt, DateDeleted)
                SELECT NEWID(), c.CityName, c.Id, GETUTCDATE(), NULL
                FROM   Cities c
                WHERE  c.DateDeleted IS NULL
                  AND  NOT EXISTS (
                        SELECT 1 FROM Districts d
                        WHERE  d.CityId      = c.Id
                          AND  d.DistrictName = c.CityName
                          AND  d.DateDeleted IS NULL
                  )
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                DELETE d
                FROM   Districts d
                JOIN   Cities c ON c.Id = d.CityId
                WHERE  d.DistrictName = c.CityName
            ");
        }
    }
}
