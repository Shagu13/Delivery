using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemovePaymentRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Orders_PaymentRequests_PaymentRequestId",
                table: "Orders");

            migrationBuilder.DropTable(
                name: "PaymentRequests");

            migrationBuilder.DropIndex(
                name: "IX_Orders_PaymentRequestId",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_DailySettlements_HasCourierHandedOverRevenue",
                table: "DailySettlements");

            migrationBuilder.DropIndex(
                name: "IX_DailySettlements_WasCourierPaid",
                table: "DailySettlements");

            migrationBuilder.DropColumn(
                name: "PaymentRequestId",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "CourierPaidAt",
                table: "DailySettlements");

            migrationBuilder.DropColumn(
                name: "HasCourierHandedOverRevenue",
                table: "DailySettlements");

            migrationBuilder.DropColumn(
                name: "RevenueHandedOverAt",
                table: "DailySettlements");

            migrationBuilder.DropColumn(
                name: "WasCourierPaid",
                table: "DailySettlements");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PaymentRequestId",
                table: "Orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CourierPaidAt",
                table: "DailySettlements",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasCourierHandedOverRevenue",
                table: "DailySettlements",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "RevenueHandedOverAt",
                table: "DailySettlements",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "WasCourierPaid",
                table: "DailySettlements",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "PaymentRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CourierId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DailySettlementId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AmountConfirmed = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    ConfirmedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ServiceFeeOffset = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentRequests_Couriers_CourierId",
                        column: x => x.CourierId,
                        principalTable: "Couriers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PaymentRequests_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PaymentRequests_DailySettlements_DailySettlementId",
                        column: x => x.DailySettlementId,
                        principalTable: "DailySettlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_PaymentRequestId",
                table: "Orders",
                column: "PaymentRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_DailySettlements_HasCourierHandedOverRevenue",
                table: "DailySettlements",
                column: "HasCourierHandedOverRevenue");

            migrationBuilder.CreateIndex(
                name: "IX_DailySettlements_WasCourierPaid",
                table: "DailySettlements",
                column: "WasCourierPaid");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentRequests_CourierId",
                table: "PaymentRequests",
                column: "CourierId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentRequests_CreatedAt",
                table: "PaymentRequests",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentRequests_CustomerId",
                table: "PaymentRequests",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentRequests_DailySettlementId",
                table: "PaymentRequests",
                column: "DailySettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentRequests_Status",
                table: "PaymentRequests",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentRequests_Type",
                table: "PaymentRequests",
                column: "Type");

            migrationBuilder.AddForeignKey(
                name: "FK_Orders_PaymentRequests_PaymentRequestId",
                table: "Orders",
                column: "PaymentRequestId",
                principalTable: "PaymentRequests",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
