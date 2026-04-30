using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDailySettlement_And_OrderCashCollected : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AmountOfCashCollected",
                table: "Orders",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DailySettlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CourierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TotalOrdersPickedUp = table.Column<int>(type: "int", nullable: false),
                    TotalOrdersDelivered = table.Column<int>(type: "int", nullable: false),
                    TotalAmountOfCashCollected = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    TotalCompanyServiceRevenue = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCompanyNetIncome = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCourierSalary = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsTheDayClosed = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailySettlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DailySettlements_Couriers_CourierId",
                        column: x => x.CourierId,
                        principalTable: "Couriers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DailySettlements_CourierId",
                table: "DailySettlements",
                column: "CourierId");

            migrationBuilder.CreateIndex(
                name: "IX_DailySettlements_CourierId_CreatedAt",
                table: "DailySettlements",
                columns: new[] { "CourierId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_DailySettlements_CreatedAt",
                table: "DailySettlements",
                column: "CreatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DailySettlements");

            migrationBuilder.DropColumn(
                name: "AmountOfCashCollected",
                table: "Orders");
        }
    }
}
