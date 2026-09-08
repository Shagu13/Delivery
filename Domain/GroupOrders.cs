using Domain.Enums;

namespace Domain;

public class GroupOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // ── Customer link (set when a logged-in customer places the order) ───────
    public Guid?     CustomerId { get; set; }
    public Customer? Customer   { get; set; }

    // ── Sender info ──────────────────────────────────────────────────────────
    public required string SenderFirstName    { get; set; }
    public required string SenderLastName     { get; set; }
    public string?         SenderIdNumber     { get; set; }
    public required string SenderBusinessName { get; set; }
    public required string SenderPhone        { get; set; }

    /// <summary>Optional second contact number the sender can supply. Null when not provided.</summary>
    public string? AlternativeSenderPhone { get; set; }

    // ── Pick-up address ──────────────────────────────────────────────────────
    // Pre-filled from the customer's registered address by default.
    // The sender can override to a different pick-up location for the current order
    // (their registered address remains unchanged).
    public required string PickUpCity     { get; set; }
    public required string PickUpDistrict { get; set; }
    public required string PickUpAddress  { get; set; }

    /// <summary>
    /// Exact coordinates of the pick-up address. Copied from <see cref="Customer.Latitude"/>
    /// when a logged-in customer places the order and hasn't changed the pre-filled pickup
    /// address. Null when the sender typed a different address or the customer has no saved pin.
    /// Lets the pickup courier navigate to an exact spot instead of fuzzy-matching the text.
    /// </summary>
    public double? PickUpLatitude  { get; set; }
    public double? PickUpLongitude { get; set; }

    // ── Assignment — set when admin assigns pickup courier ───────────────────
    public Guid?      CourierId   { get; set; }
    public Courier?   Courier     { get; set; }
    public Guid?      WarehouseId { get; set; }
    public Warehouse? Warehouse   { get; set; }

    // ── Details ──────────────────────────────────────────────────────────────
    public string? Note             { get; set; }
    public int     NumberOfPackages { get; set; }

    /// <summary>
    /// Uses the unified OrderStatus enum.
    /// GroupOrder-relevant statuses: Pending, AcceptedGroupOrder, CourierAssignedToPickUp,
    /// CourierDeliveringToWarehouse, DeliveredToWarehouse,
    /// AdminAcceptedOrderInWareHouse, CancelledBySender, OrderNotAccepted, CancelledByAdmin.
    /// </summary>
    public OrderStatus Status { get; set; } = OrderStatus.Pending;

    /// <summary>
    /// True when this batch was created by staff through the admin "+ Add Package"
    /// walk-in flow rather than placed by the customer. The batch and its orders stay
    /// fully real for admin, courier, and finance purposes — this flag only hides them
    /// from the customer-facing portal so office packages never appear in a customer's
    /// own history. Copied onto every child <see cref="Order.IsWalkIn"/>.
    /// </summary>
    public bool IsWalkIn { get; set; } = false;

    // ── Soft delete ──────────────────────────────────────────────────────────
    /// <summary>
    /// Set when an admin deletes this batch (or when its last non-deleted child order is
    /// deleted) from the "Delete Package" page. Null = active. A non-null value hides the
    /// batch from every read in the system via a global EF query filter; deleting the batch
    /// also stamps <see cref="Order.DateDeleted"/> on every child order. There is no restore
    /// path — the row is kept only so finance and audit history are not corrupted.
    /// </summary>
    public DateTime? DateDeleted { get; set; }

    // ── Timestamps ───────────────────────────────────────────────────────────
    public DateTime  CreatedAt              { get; set; } = CustomTime.Now;
    public DateTime? AcceptedAt             { get; set; }
    public DateTime? PickedUpAt             { get; set; }
    public DateTime? DeliveredToWarehouseAt { get; set; }

    /// <summary>
    /// Date the admin schedules for the courier to pick up the batch from the sender.
    /// Shown to recipients so they know when their parcel will be collected.
    /// Set by the admin after accepting the group order.
    /// </summary>
    public DateTime? WhenPackagePickedUpDate { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    public ICollection<Order> Orders { get; set; } = new List<Order>();
}
