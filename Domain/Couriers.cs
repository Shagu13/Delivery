using System;
using System.Collections.Generic;
using System.Text;

namespace Domain
{
    public class Courier
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public required string FirstName { get; set; }
        public required string LastName { get; set; }
        public required string IdNumber { get; set; }
        public required string PhoneNumber { get; set; }
        public required string AssignedCity { get; set; }      
        public required string AssignedDistrict { get; set; }  
        /// <summary>Null = active courier. Non-null = soft-deleted; the value is the deletion timestamp.</summary>
        public DateTime? DateDeleted { get; set; }

        // Identity link
        public required string ApplicationUserId { get; set; }
        public ApplicationUser ApplicationUser { get; set; } = null!;

        // Navigation
        public ICollection<Order>           Orders           { get; set; } = new List<Order>();
        public ICollection<GroupOrder>      GroupOrders      { get; set; } = new List<GroupOrder>();
        public ICollection<CourierSettlement> CourierSettlements { get; set; } = new List<CourierSettlement>();
    }
}
