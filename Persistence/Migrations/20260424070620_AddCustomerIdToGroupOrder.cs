using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerIdToGroupOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CustomerId",
                table: "GroupOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_CustomerId",
                table: "GroupOrders",
                column: "CustomerId");

            migrationBuilder.AddForeignKey(
                name: "FK_GroupOrders_Customers_CustomerId",
                table: "GroupOrders",
                column: "CustomerId",
                principalTable: "Customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GroupOrders_Customers_CustomerId",
                table: "GroupOrders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_CustomerId",
                table: "GroupOrders");

            migrationBuilder.DropColumn(
                name: "CustomerId",
                table: "GroupOrders");
        }
    }
}
