using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerTieredPrices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompanyPriceToDeliverPackages",
                table: "Customers");

            migrationBuilder.AddColumn<decimal>(
                name: "CompanyServiceCapitalPrice",
                table: "Customers",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CompanyServiceCityPrice",
                table: "Customers",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CompanyServiceDistrictPrice",
                table: "Customers",
                type: "decimal(18,2)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompanyServiceCapitalPrice",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "CompanyServiceCityPrice",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "CompanyServiceDistrictPrice",
                table: "Customers");

            migrationBuilder.AddColumn<decimal>(
                name: "CompanyPriceToDeliverPackages",
                table: "Customers",
                type: "decimal(18,2)",
                nullable: true);
        }
    }
}