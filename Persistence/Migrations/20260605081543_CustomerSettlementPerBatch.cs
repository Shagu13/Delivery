using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CustomerSettlementPerBatch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Old monthly rows don't map to the new per-batch grain (no GroupOrderId/
            // OrderId). Clear them so the table only holds well-formed batch invoices.
            migrationBuilder.Sql("DELETE FROM [CustomerSettlements];");

            migrationBuilder.DropIndex(
                name: "IX_CustomerSettlements_CustomerId_Year_Month",
                table: "CustomerSettlements");

            migrationBuilder.DropColumn(
                name: "Month",
                table: "CustomerSettlements");

            migrationBuilder.DropColumn(
                name: "Year",
                table: "CustomerSettlements");

            migrationBuilder.AddColumn<DateTime>(
                name: "DateDeleted",
                table: "CustomerSettlements",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "GroupOrderId",
                table: "CustomerSettlements",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OrderId",
                table: "CustomerSettlements",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerSettlements_DateDeleted",
                table: "CustomerSettlements",
                column: "DateDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerSettlements_GroupOrderId",
                table: "CustomerSettlements",
                column: "GroupOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerSettlements_OrderId",
                table: "CustomerSettlements",
                column: "OrderId");

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerSettlements_GroupOrders_GroupOrderId",
                table: "CustomerSettlements",
                column: "GroupOrderId",
                principalTable: "GroupOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerSettlements_Orders_OrderId",
                table: "CustomerSettlements",
                column: "OrderId",
                principalTable: "Orders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerSettlements_GroupOrders_GroupOrderId",
                table: "CustomerSettlements");

            migrationBuilder.DropForeignKey(
                name: "FK_CustomerSettlements_Orders_OrderId",
                table: "CustomerSettlements");

            migrationBuilder.DropIndex(
                name: "IX_CustomerSettlements_DateDeleted",
                table: "CustomerSettlements");

            migrationBuilder.DropIndex(
                name: "IX_CustomerSettlements_GroupOrderId",
                table: "CustomerSettlements");

            migrationBuilder.DropIndex(
                name: "IX_CustomerSettlements_OrderId",
                table: "CustomerSettlements");

            migrationBuilder.DropColumn(
                name: "DateDeleted",
                table: "CustomerSettlements");

            migrationBuilder.DropColumn(
                name: "GroupOrderId",
                table: "CustomerSettlements");

            migrationBuilder.DropColumn(
                name: "OrderId",
                table: "CustomerSettlements");

            migrationBuilder.AddColumn<int>(
                name: "Month",
                table: "CustomerSettlements",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Year",
                table: "CustomerSettlements",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerSettlements_CustomerId_Year_Month",
                table: "CustomerSettlements",
                columns: new[] { "CustomerId", "Year", "Month" },
                unique: true);
        }
    }
}
