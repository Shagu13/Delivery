using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDailySettlementFinancialBreakdown : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CompanyNetCashAfterCod",
                table: "DailySettlements",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "TotalCodOwedToSenders",
                table: "DailySettlements",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "TotalServiceFeesOwedBySenders",
                table: "DailySettlements",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompanyNetCashAfterCod",
                table: "DailySettlements");

            migrationBuilder.DropColumn(
                name: "TotalCodOwedToSenders",
                table: "DailySettlements");

            migrationBuilder.DropColumn(
                name: "TotalServiceFeesOwedBySenders",
                table: "DailySettlements");
        }
    }
}
