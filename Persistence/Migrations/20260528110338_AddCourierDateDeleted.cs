using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCourierDateDeleted : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Couriers");

            migrationBuilder.DropColumn(
                name: "IsAvailable",
                table: "Couriers");

            migrationBuilder.AddColumn<DateTime>(
                name: "DateDeleted",
                table: "Couriers",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DateDeleted",
                table: "Couriers");

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Couriers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsAvailable",
                table: "Couriers",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }
    }
}
