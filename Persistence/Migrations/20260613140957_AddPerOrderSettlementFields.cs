using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPerOrderSettlementFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CodPaidToCustomerAmount",
                table: "Orders",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CodPaidToCustomerAt",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsCollectedCodPaidToCustomer",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "ServicePaidByCustomerAmount",
                table: "Orders",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ServicePaidByCustomerAt",
                table: "Orders",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CodPaidToCustomerAmount",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "CodPaidToCustomerAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsCollectedCodPaidToCustomer",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ServicePaidByCustomerAmount",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ServicePaidByCustomerAt",
                table: "Orders");
        }
    }
}
