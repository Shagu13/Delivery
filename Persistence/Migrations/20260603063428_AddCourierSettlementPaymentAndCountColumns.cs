using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCourierSettlementPaymentAndCountColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AmountCourierWasPaid",
                table: "CourierSettlements",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "NumberOfOrderPostponed",
                table: "CourierSettlements",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "NumberOfOrdersCancelled",
                table: "CourierSettlements",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "CourierSettlements",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AmountCourierWasPaid",
                table: "CourierSettlements");

            migrationBuilder.DropColumn(
                name: "NumberOfOrderPostponed",
                table: "CourierSettlements");

            migrationBuilder.DropColumn(
                name: "NumberOfOrdersCancelled",
                table: "CourierSettlements");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "CourierSettlements");
        }
    }
}
