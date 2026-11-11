using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderIsPartnerApiOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPartnerApiOrder",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Orders_IsPartnerApiOrder_CreatedAt",
                table: "Orders",
                columns: new[] { "IsPartnerApiOrder", "CreatedAt" },
                filter: "[IsPartnerApiOrder] = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Orders_IsPartnerApiOrder_CreatedAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsPartnerApiOrder",
                table: "Orders");
        }
    }
}
