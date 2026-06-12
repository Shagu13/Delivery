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
    /// CourierOnTheWayToPickUp, CourierDeliveringToWarehouse, DeliveredToWarehouse,
    /// AdminAcceptedOrderInWareHouse, CancelledBySender, OrderNotAccepted, CancelledByAdmin.
    /// </summary>
    public OrderStatus Status { get; set; } = OrderStatus.Pending;

    // ── Timestamps ───────────────────────────────────────────────────────────
    public DateTime  CreatedAt              { get; set; } = DateTime.UtcNow;
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
