using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDistrictTerritoryFlags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsDeliveryAddressInCityItself",
                table: "Orders");

            migrationBuilder.AddColumn<bool>(
                name: "IsCapitalTerritory",
                table: "Districts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsCityTerritory",
                table: "Districts",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsCapitalTerritory",
                table: "Districts");

            migrationBuilder.DropColumn(
                name: "IsCityTerritory",
                table: "Districts");

            migrationBuilder.AddColumn<bool>(
                name: "IsDeliveryAddressInCityItself",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }
    }
}
