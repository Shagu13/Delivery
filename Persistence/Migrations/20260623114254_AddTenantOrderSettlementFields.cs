using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantOrderSettlementFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CodPaidToTenantAmount",
                table: "Orders",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CodPaidToTenantAt",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ServicePaidByTenantAmount",
                table: "Orders",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ServicePaidByTenantAt",
                table: "Orders",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CodPaidToTenantAmount",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "CodPaidToTenantAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ServicePaidByTenantAmount",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ServicePaidByTenantAt",
                table: "Orders");
        }
    }
}
