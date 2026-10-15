using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PasswordResetSmsCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PasswordResetTokens_Code",
                table: "PasswordResetTokens");

            migrationBuilder.DropColumn(
                name: "Code",
                table: "PasswordResetTokens");

            migrationBuilder.AddColumn<int>(
                name: "Attempts",
                table: "PasswordResetTokens",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "CodeHash",
                table: "PasswordResetTokens",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TicketExpiresAt",
                table: "PasswordResetTokens",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TicketHash",
                table: "PasswordResetTokens",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PasswordResetTokens_TicketHash",
                table: "PasswordResetTokens",
                column: "TicketHash");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PasswordResetTokens_TicketHash",
                table: "PasswordResetTokens");

            migrationBuilder.DropColumn(
                name: "Attempts",
                table: "PasswordResetTokens");

            migrationBuilder.DropColumn(
                name: "CodeHash",
                table: "PasswordResetTokens");

            migrationBuilder.DropColumn(
                name: "TicketExpiresAt",
                table: "PasswordResetTokens");

            migrationBuilder.DropColumn(
                name: "TicketHash",
                table: "PasswordResetTokens");

            migrationBuilder.AddColumn<string>(
                name: "Code",
                table: "PasswordResetTokens",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_PasswordResetTokens_Code",
                table: "PasswordResetTokens",
                column: "Code",
                unique: true);
        }
    }
}
