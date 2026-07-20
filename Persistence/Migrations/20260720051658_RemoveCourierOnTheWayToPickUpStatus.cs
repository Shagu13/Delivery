using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// Retires the CourierOnTheWayToPickUp status. The separate "on my way" pickup step no
    /// longer exists — the courier confirms pickup in one action from CourierAssignedToPickUp.
    ///
    /// Data-only: OrderStatus persists as its *name* (HasConversion&lt;string&gt;), so the
    /// column shape is unchanged, but any row still holding the retired name would throw on
    /// materialisation once the enum member is gone. This rewrites them first.
    /// </summary>
    public partial class RemoveCourierOnTheWayToPickUpStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Map backwards, not forwards: these rows had a courier assigned and en route
            // but had NOT been collected. Moving them to CourierDeliveringToWarehouse would
            // assert a pickup that never happened and desynchronise PickedUpAt. Landing on
            // CourierAssignedToPickUp is truthful and keeps the batch appendable.
            migrationBuilder.Sql(@"
                UPDATE GroupOrders
                   SET Status = 'CourierAssignedToPickUp'
                 WHERE Status = 'CourierOnTheWayToPickUp';");

            migrationBuilder.Sql(@"
                UPDATE Orders
                   SET Status = 'CourierAssignedToPickUp'
                 WHERE Status = 'CourierOnTheWayToPickUp';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Deliberately empty — irreversible. Rewritten rows are indistinguishable from
            // those that were genuinely CourierAssignedToPickUp, so the original value
            // cannot be recovered. Reverting the code is safe; the data stays as-is.
        }
    }
}
