using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderOriginalPackagePrice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "OriginalPackagePrice",
                table: "Orders",
                type: "decimal(18,2)",
                nullable: true);

            // Existing orders: the best available original is the current COD. Orders a courier
            // already corrected at the door have lost their true original and keep the corrected one.
            migrationBuilder.Sql("UPDATE [Orders] SET [OriginalPackagePrice] = [AmountToCollectForPackage]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OriginalPackagePrice",
                table: "Orders");
        }
    }
}
