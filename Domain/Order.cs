using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Diagnostics.Metrics;
using System.Text;

namespace Domain
{
    [Index(nameof(TrackingNumber), IsUnique = true)]
    public class Order
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid GroupOrderId { get; set; }
        public GroupOrder GroupOrder { get; set; } = null!;

        // Recipient / Delivery
        public required string RecipientFirstName { get; set; }
        public required string RecipientLastName { get; set; }
        public required string RecipientPhone { get; set; }
        public required string RecipientCity { get; set; }
        public required string RecipientDistrict { get; set; }
        public required string RecipientAddress { get; set; }

        // Assignment
        public Guid? CourierId { get; set; }
        public Courier? Courier { get; set; }
        public Guid? WarehouseId { get; set; }
        public Warehouse? Warehouse { get; set; }

        // Details
        public string? Description { get; set; }
        public OrderStatus Status { get; set; } = OrderStatus.Pending;
        public required string TrackingNumber { get; set; }
        public required bool IsPaid { get; set; }

        // Timestamps
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? PickedUpFromWarehouseAt { get; set; }
        public DateTime? DeliveredAt { get; set; }

        // Navigation
        public ICollection<TrackingEvent> TrackingEvents { get; set; } = new List<TrackingEvent>();
    }
}
