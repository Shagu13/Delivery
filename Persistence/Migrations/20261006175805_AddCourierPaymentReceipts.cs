using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCourierPaymentReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "CustomerId",
                table: "PaymentReceipts",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "CourierId",
                table: "PaymentReceipts",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Flow",
                table: "PaymentReceipts",
                type: "varchar(30)",
                unicode: false,
                maxLength: 30,
                nullable: false,
                defaultValue: "");

            // Every receipt that exists today is a customer receipt — derive its Flow from IsService.
            migrationBuilder.Sql(
                "UPDATE PaymentReceipts SET Flow = CASE WHEN IsService = 1 THEN 'ServiceFee' ELSE 'CodPayout' END");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_CourierId",
                table: "PaymentReceipts",
                column: "CourierId");

            migrationBuilder.AddForeignKey(
                name: "FK_PaymentReceipts_Couriers_CourierId",
                table: "PaymentReceipts",
                column: "CourierId",
                principalTable: "Couriers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PaymentReceipts_Couriers_CourierId",
                table: "PaymentReceipts");

            migrationBuilder.DropIndex(
                name: "IX_PaymentReceipts_CourierId",
                table: "PaymentReceipts");

            migrationBuilder.DropColumn(
                name: "CourierId",
                table: "PaymentReceipts");

            migrationBuilder.DropColumn(
                name: "Flow",
                table: "PaymentReceipts");

            migrationBuilder.AlterColumn<Guid>(
                name: "CustomerId",
                table: "PaymentReceipts",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }
    }
}
