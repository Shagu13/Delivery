using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAssignedToCourierAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "AssignedToCourierAt",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            // Backfill existing assigned orders: they predate this timestamp, so use
            // CreatedAt as a best-effort assignment date so historical orders still
            // appear under the courier day view.
            migrationBuilder.Sql(
                "UPDATE [Orders] SET [AssignedToCourierAt] = [CreatedAt] WHERE [CourierId] IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssignedToCourierAt",
                table: "Orders");
        }
    }
}
