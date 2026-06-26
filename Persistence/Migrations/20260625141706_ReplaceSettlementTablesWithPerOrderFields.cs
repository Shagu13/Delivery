using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ReplaceSettlementTablesWithPerOrderFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CourierSettlements");

            migrationBuilder.DropTable(
                name: "CustomerSettlements");

            migrationBuilder.AddColumn<decimal>(
                name: "CodTransferedToCompanyByCourier",
                table: "Orders",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CodTransferedToCompanyByCourierAt",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CourierSalaryPaidAmount",
                table: "Orders",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CourierSalaryPaidAt",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsCompanyServicePriceIncludedSpecialCase",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsCourierSalaryIncludedSpecialCase",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CodTransferedToCompanyByCourier",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "CodTransferedToCompanyByCourierAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "CourierSalaryPaidAmount",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "CourierSalaryPaidAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsCompanyServicePriceIncludedSpecialCase",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsCourierSalaryIncludedSpecialCase",
                table: "Orders");

            migrationBuilder.CreateTable(
                name: "CourierSettlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CourierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AmountCourierWasPaid = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsTheDayClosed = table.Column<bool>(type: "bit", nullable: false),
                    NumberOfOrderPostponed = table.Column<int>(type: "int", nullable: false),
                    NumberOfOrdersCancelled = table.Column<int>(type: "int", nullable: false),
                    TotalAmountOfCashCollected = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    TotalCompanyNetIncome = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCompanyServicePriceCollectedFromRecipient = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCompanyServiceRevenue = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCourierSalary = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCourierTransferToCompany = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalOrdersDelivered = table.Column<int>(type: "int", nullable: false),
                    TotalOrdersPickedUp = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourierSettlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourierSettlements_Couriers_CourierId",
                        column: x => x.CourierId,
                        principalTable: "Couriers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CustomerSettlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GroupOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AmountOfCollectedCodPaidByCompany = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    AmountPaidToCompanyForCompanyService = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DateDeleted = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TotalAmountOfCollectedCodPaidByCompany = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalAmountPaidToCompanyForCompanyService = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCODCompanyCollectedForPackages = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCompanyServicePriceOwedToCompany = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalNumberOfOrderDelivered = table.Column<int>(type: "int", nullable: false),
                    TotalNumberOfOrdersPlaced = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerSettlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerSettlements_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerSettlements_GroupOrders_GroupOrderId",
                        column: x => x.GroupOrderId,
                        principalTable: "GroupOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerSettlements_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CourierSettlements_CourierId",
                table: "CourierSettlements",
                column: "CourierId");

            migrationBuilder.CreateIndex(
                name: "IX_CourierSettlements_CourierId_CreatedAt",
                table: "CourierSettlements",
                columns: new[] { "CourierId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CourierSettlements_CreatedAt",
                table: "CourierSettlements",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerSettlements_CustomerId",
                table: "CustomerSettlements",
                column: "CustomerId");

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
        }
    }
}
