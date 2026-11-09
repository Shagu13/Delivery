using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderDeliveryDateIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Orders_DeliveredAt_Active",
                table: "Orders",
                column: "DeliveredAt",
                filter: "[DateDeleted] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_DeliveredToWarehouseAt_Active",
                table: "Orders",
                column: "DeliveredToWarehouseAt",
                filter: "[DateDeleted] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Orders_DeliveredAt_Active",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_DeliveredToWarehouseAt_Active",
                table: "Orders");
        }
    }
}
