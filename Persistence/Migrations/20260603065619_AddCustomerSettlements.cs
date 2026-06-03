using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerSettlements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CustomerSettlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Year = table.Column<int>(type: "int", nullable: false),
                    Month = table.Column<int>(type: "int", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TotalNumberOfOrdersPlaced = table.Column<int>(type: "int", nullable: false),
                    TotalNumberOfOrderDelivered = table.Column<int>(type: "int", nullable: false),
                    TotalCODCompanyCollectedForPackages = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCompanyServicePriceOwedToCompany = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalAmountOfCollectedCodPaidByCompany = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    AmountOfCollectedCodPaidByCompany = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalAmountPaidToCompanyForCompanyService = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    AmountPaidToCompanyForCompanyService = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
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
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerSettlements_CustomerId",
                table: "CustomerSettlements",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerSettlements_CustomerId_Year_Month",
                table: "CustomerSettlements",
                columns: new[] { "CustomerId", "Year", "Month" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CustomerSettlements");
        }
    }
}
