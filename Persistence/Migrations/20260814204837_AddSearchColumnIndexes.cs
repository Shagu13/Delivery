using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchColumnIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Orders_RecipientAddress",
                table: "Orders",
                column: "RecipientAddress");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_RecipientDistrict",
                table: "Orders",
                column: "RecipientDistrict");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_RecipientName",
                table: "Orders",
                column: "RecipientName");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_RecipientPhone",
                table: "Orders",
                column: "RecipientPhone");

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_AlternativeSenderPhone",
                table: "GroupOrders",
                column: "AlternativeSenderPhone");

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_PickUpAddress",
                table: "GroupOrders",
                column: "PickUpAddress");

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_PickUpDistrict",
                table: "GroupOrders",
                column: "PickUpDistrict");

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_SenderBusinessName",
                table: "GroupOrders",
                column: "SenderBusinessName");

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_SenderFirstName",
                table: "GroupOrders",
                column: "SenderFirstName");

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_SenderLastName",
                table: "GroupOrders",
                column: "SenderLastName");

            migrationBuilder.CreateIndex(
                name: "IX_GroupOrders_SenderPhone",
                table: "GroupOrders",
                column: "SenderPhone");

            migrationBuilder.CreateIndex(
                name: "IX_Customers_Address",
                table: "Customers",
                column: "Address");

            migrationBuilder.CreateIndex(
                name: "IX_Customers_District",
                table: "Customers",
                column: "District");

            migrationBuilder.CreateIndex(
                name: "IX_Customers_FirstName",
                table: "Customers",
                column: "FirstName");

            migrationBuilder.CreateIndex(
                name: "IX_Customers_LastName",
                table: "Customers",
                column: "LastName");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Orders_RecipientAddress",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_RecipientDistrict",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_RecipientName",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_RecipientPhone",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_AlternativeSenderPhone",
                table: "GroupOrders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_PickUpAddress",
                table: "GroupOrders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_PickUpDistrict",
                table: "GroupOrders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_SenderBusinessName",
                table: "GroupOrders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_SenderFirstName",
                table: "GroupOrders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_SenderLastName",
                table: "GroupOrders");

            migrationBuilder.DropIndex(
                name: "IX_GroupOrders_SenderPhone",
                table: "GroupOrders");

            migrationBuilder.DropIndex(
                name: "IX_Customers_Address",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Customers_District",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Customers_FirstName",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Customers_LastName",
                table: "Customers");
        }
    }
}
