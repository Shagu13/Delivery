using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPackageSoftDelete : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Orders_CreatedAt",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_CreatedAt",
                table: "GroupOrders");

            migrationBuilder.AddColumn<DateTime>(
                name: "DateDeleted",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DateDeleted",
                table: "GroupOrders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CreatedAt_Active",
                table: "Orders",
                column: "CreatedAt",
                filter: "[DateDeleted] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_CreatedAt_Active",
                table: "GroupOrders",
                column: "CreatedAt",
                filter: "[DateDeleted] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Orders_CreatedAt_Active",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_CreatedAt_Active",
                table: "GroupOrders");

            migrationBuilder.DropColumn(
                name: "DateDeleted",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DateDeleted",
                table: "GroupOrders");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CreatedAt",
                table: "Orders",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_CreatedAt",
                table: "GroupOrders",
                column: "CreatedAt");
        }
    }
}
