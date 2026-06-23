using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantSettlement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TenantSettlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Year = table.Column<int>(type: "int", nullable: false),
                    Month = table.Column<int>(type: "int", nullable: false),
                    TotalNumberOfOrdersPlaced = table.Column<int>(type: "int", nullable: false),
                    TotalNumberOfOrderDelivered = table.Column<int>(type: "int", nullable: false),
                    TotalCODCompanyCollectedForTenant = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalCompanyServicePriceOwedByTenant = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalAmountOfCollectedCodPaidToTenant = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    AmountOfCollectedCodPaidToTenant = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalAmountPaidToCompanyForCompanyService = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    AmountPaidToCompanyForCompanyService = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantSettlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TenantSettlements_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantSettlements_TenantId",
                table: "TenantSettlements",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_TenantSettlements_TenantId_Year_Month",
                table: "TenantSettlements",
                columns: new[] { "TenantId", "Year", "Month" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantSettlements");
        }
    }
}
