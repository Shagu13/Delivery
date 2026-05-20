using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class WeightPriceTierAdded : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "WeightPriceTierId",
                table: "Orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "WeightPriceTiers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Label = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    MinWeightKg = table.Column<decimal>(type: "decimal(18,3)", nullable: false),
                    MaxWeightKg = table.Column<decimal>(type: "decimal(18,3)", nullable: false),
                    IsStandard = table.Column<bool>(type: "bit", nullable: false),
                    CustomPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DateDeleted = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WeightPriceTiers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_WeightPriceTierId",
                table: "Orders",
                column: "WeightPriceTierId");

            migrationBuilder.CreateIndex(
                name: "IX_WeightPriceTiers_DateDeleted",
                table: "WeightPriceTiers",
                column: "DateDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_WeightPriceTiers_MinWeightKg_MaxWeightKg",
                table: "WeightPriceTiers",
                columns: new[] { "MinWeightKg", "MaxWeightKg" });

            migrationBuilder.AddForeignKey(
                name: "FK_Orders_WeightPriceTiers_WeightPriceTierId",
                table: "Orders",
                column: "WeightPriceTierId",
                principalTable: "WeightPriceTiers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Orders_WeightPriceTiers_WeightPriceTierId",
                table: "Orders");

            migrationBuilder.DropTable(
                name: "WeightPriceTiers");

            migrationBuilder.DropIndex(
                name: "IX_Orders_WeightPriceTierId",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "WeightPriceTierId",
                table: "Orders");
        }
    }
}
