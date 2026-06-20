using System;
using System.Collections.Generic;
using System.Text;

namespace Domain
{
    public class TrackingEvent
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid OrderId { get; set; }
        public required string Status { get; set; }
        public required string Description { get; set; }
        public DateTime CreatedAt { get; set; } = CustomTime.Now;
    }
}
