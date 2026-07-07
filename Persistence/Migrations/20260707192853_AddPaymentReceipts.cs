using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PaymentReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsService = table.Column<bool>(type: "bit", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    PaidAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentReceipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentReceipts_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PaymentReceiptAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PaymentReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentReceiptAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentReceiptAllocations_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PaymentReceiptAllocations_PaymentReceipts_PaymentReceiptId",
                        column: x => x.PaymentReceiptId,
                        principalTable: "PaymentReceipts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceiptAllocations_OrderId",
                table: "PaymentReceiptAllocations",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceiptAllocations_PaymentReceiptId",
                table: "PaymentReceiptAllocations",
                column: "PaymentReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_CustomerId",
                table: "PaymentReceipts",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_PaidAt",
                table: "PaymentReceipts",
                column: "PaidAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentReceiptAllocations");

            migrationBuilder.DropTable(
                name: "PaymentReceipts");
        }
    }
}
