using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RenameDailySettlementToCourierSettlement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // In-place rename — preserves all existing rows. (EF scaffolded a
            // destructive DropTable + CreateTable; replaced with sp_rename-based ops.)
            migrationBuilder.RenameTable(
                name: "DailySettlements",
                newName: "CourierSettlements");

            migrationBuilder.RenameIndex(
                name: "IX_DailySettlements_CourierId",
                table: "CourierSettlements",
                newName: "IX_CourierSettlements_CourierId");

            migrationBuilder.RenameIndex(
                name: "IX_DailySettlements_CourierId_CreatedAt",
                table: "CourierSettlements",
                newName: "IX_CourierSettlements_CourierId_CreatedAt");

            migrationBuilder.RenameIndex(
                name: "IX_DailySettlements_CreatedAt",
                table: "CourierSettlements",
                newName: "IX_CourierSettlements_CreatedAt");

            // Rename the PK and FK constraints to match the new table name so the
            // database stays consistent with the model snapshot.
            migrationBuilder.Sql("EXEC sp_rename N'PK_DailySettlements', N'PK_CourierSettlements';");
            migrationBuilder.Sql("EXEC sp_rename N'FK_DailySettlements_Couriers_CourierId', N'FK_CourierSettlements_Couriers_CourierId';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameIndex(
                name: "IX_CourierSettlements_CourierId",
                table: "CourierSettlements",
                newName: "IX_DailySettlements_CourierId");

            migrationBuilder.RenameIndex(
                name: "IX_CourierSettlements_CourierId_CreatedAt",
                table: "CourierSettlements",
                newName: "IX_DailySettlements_CourierId_CreatedAt");

            migrationBuilder.RenameIndex(
                name: "IX_CourierSettlements_CreatedAt",
                table: "CourierSettlements",
                newName: "IX_DailySettlements_CreatedAt");

            migrationBuilder.Sql("EXEC sp_rename N'PK_CourierSettlements', N'PK_DailySettlements';");
            migrationBuilder.Sql("EXEC sp_rename N'FK_CourierSettlements_Couriers_CourierId', N'FK_DailySettlements_Couriers_CourierId';");

            migrationBuilder.RenameTable(
                name: "CourierSettlements",
                newName: "DailySettlements");
        }
    }
}
