using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UniteRecipientName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Repurpose the first-name column as the united full-name column, widening
            // it first so the concatenated value (first + ' ' + last) isn't truncated,
            // fold each existing last name onto it, then drop the now-redundant column.
            // This preserves existing recipient names (no drop/add data loss).
            migrationBuilder.RenameColumn(
                name: "RecipientFirstName",
                table: "Orders",
                newName: "RecipientName");

            migrationBuilder.AlterColumn<string>(
                name: "RecipientName",
                table: "Orders",
                type: "nvarchar(201)",
                maxLength: 201,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(100)",
                oldMaxLength: 100);

            migrationBuilder.Sql(
                "UPDATE [Orders] SET [RecipientName] = LTRIM(RTRIM([RecipientName] + N' ' + [RecipientLastName]))");

            migrationBuilder.DropColumn(
                name: "RecipientLastName",
                table: "Orders");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Best-effort reverse: re-create the last-name column (empty) and rename the
            // united column back to the first-name column. The original first/last split
            // cannot be reconstructed; the full name is left in RecipientFirstName.
            migrationBuilder.AddColumn<string>(
                name: "RecipientLastName",
                table: "Orders",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AlterColumn<string>(
                name: "RecipientName",
                table: "Orders",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(201)",
                oldMaxLength: 201);

            migrationBuilder.RenameColumn(
                name: "RecipientName",
                table: "Orders",
                newName: "RecipientFirstName");
        }
    }
}
