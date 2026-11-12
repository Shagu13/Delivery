using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CourierZoneSalaries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The single DefaultSalary is deliberately discarded (not renamed): every courier starts
            // with empty zone salaries and the admin re-enters them per zone.
            migrationBuilder.DropColumn(
                name: "DefaultSalary",
                table: "Couriers");

            migrationBuilder.AddColumn<decimal>(
                name: "DistrictSalary",
                table: "Couriers",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CapitalSalary",
                table: "Couriers",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CitySalary",
                table: "Couriers",
                type: "decimal(18,2)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CapitalSalary",
                table: "Couriers");

            migrationBuilder.DropColumn(
                name: "CitySalary",
                table: "Couriers");

            migrationBuilder.DropColumn(
                name: "DistrictSalary",
                table: "Couriers");

            migrationBuilder.AddColumn<decimal>(
                name: "DefaultSalary",
                table: "Couriers",
                type: "decimal(18,2)",
                nullable: true);
        }
    }
}
