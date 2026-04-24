using Domain.Enums;

namespace Domain
{
    public class GroupOrder
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        // ── Customer link (set when a logged-in customer places the order) ───
        public Guid? CustomerId { get; set; }
        public Customer? Customer { get; set; }

        // Sender / Pickup
        public required string SenderFirstName { get; set; }
        public required string SenderLastName { get; set; }
        public string? SenderIdNumber { get; set; }
        public required string SenderBusinessName { get; set; }
        public required string SenderPhone { get; set; }
        public required string PickUpCity { get; set; }
        public required string PickUpDistrict { get; set; }
        public required string PickUpAddress { get; set; }

        // Assignment
        public Guid? CourierId { get; set; }
        public Courier? Courier { get; set; }
        public Guid? WarehouseId { get; set; }
        public Warehouse? Warehouse { get; set; }

        // Details
        public string? Note { get; set; }
        public int NumberOfPackages { get; set; }
        public GroupOrderStatus Status { get; set; } = GroupOrderStatus.Pending;

        // Timestamps
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? AcceptedAt { get; set; }
        public DateTime? PickedUpAt { get; set; }
        public DateTime? DeliveredToWarehouseAt { get; set; }

        // Navigation
        public ICollection<Order> Orders { get; set; } = new List<Order>();
    }
}
