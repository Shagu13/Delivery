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
        public bool IsAvailable { get; set; } = true;

        /// <summary>Admin-controlled. False = courier is soft-deleted/disabled and cannot log in.</summary>
        public bool IsActive { get; set; } = true;

        // Identity link
        public required string ApplicationUserId { get; set; }
        public ApplicationUser ApplicationUser { get; set; } = null!;

        // Navigation
        public ICollection<Order>           Orders           { get; set; } = new List<Order>();
        public ICollection<GroupOrder>      GroupOrders      { get; set; } = new List<GroupOrder>();
        public ICollection<DailySettlement> DailySettlements { get; set; } = new List<DailySettlement>();
    }
}
