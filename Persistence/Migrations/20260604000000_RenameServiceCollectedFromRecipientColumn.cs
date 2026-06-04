using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RenameServiceCollectedFromRecipientColumn : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TotalCompanyServicePriceCollectedByRecipient",
                table: "CourierSettlements",
                newName: "TotalCompanyServicePriceCollectedFromRecipient");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TotalCompanyServicePriceCollectedFromRecipient",
                table: "CourierSettlements",
                newName: "TotalCompanyServicePriceCollectedByRecipient");
        }
    }
}
