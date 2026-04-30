using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Task1_5_Schema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "IsPaid",
                table: "Orders",
                newName: "IsFragile");

            migrationBuilder.AddColumn<decimal>(
                name: "CourierSalary",
                table: "Orders",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeliveryDateFrom",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeliveryDateTo",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProductPaymentStatus",
                table: "Orders",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "WhoPaysForCompanyService",
                table: "Orders",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "WhenPackagePickedUpDate",
                table: "GroupOrders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CompanyPriceToDeliverPackages",
                table: "Customers",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Cities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CityName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DateDeleted = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Districts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DistrictName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DateDeleted = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Districts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Districts_Cities_CityId",
                        column: x => x.CityId,
                        principalTable: "Cities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Cities_CityName",
                table: "Cities",
                column: "CityName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Cities_DateDeleted",
                table: "Cities",
                column: "DateDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_Districts_CityId_DistrictName",
                table: "Districts",
                columns: new[] { "CityId", "DistrictName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Districts_DateDeleted",
                table: "Districts",
                column: "DateDeleted");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Districts");

            migrationBuilder.DropTable(
                name: "Cities");

            migrationBuilder.DropColumn(
                name: "CourierSalary",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryDateFrom",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryDateTo",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ProductPaymentStatus",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "WhoPaysForCompanyService",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "WhenPackagePickedUpDate",
                table: "GroupOrders");

            migrationBuilder.DropColumn(
                name: "CompanyPriceToDeliverPackages",
                table: "Customers");

            migrationBuilder.RenameColumn(
                name: "IsFragile",
                table: "Orders",
                newName: "IsPaid");
        }
    }
}
