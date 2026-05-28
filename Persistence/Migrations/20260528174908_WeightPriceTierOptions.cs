using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class WeightPriceTierOptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsStandard",
                table: "WeightPriceTiers");

            migrationBuilder.RenameColumn(
                name: "CustomPrice",
                table: "WeightPriceTiers",
                newName: "DistrictPrice");

            migrationBuilder.AddColumn<decimal>(
                name: "CapitalPrice",
                table: "WeightPriceTiers",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CityPrice",
                table: "WeightPriceTiers",
                type: "decimal(18,2)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CapitalPrice",
                table: "WeightPriceTiers");

            migrationBuilder.DropColumn(
                name: "CityPrice",
                table: "WeightPriceTiers");

            migrationBuilder.RenameColumn(
                name: "DistrictPrice",
                table: "WeightPriceTiers",
                newName: "CustomPrice");

            migrationBuilder.AddColumn<bool>(
                name: "IsStandard",
                table: "WeightPriceTiers",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }
    }
}
