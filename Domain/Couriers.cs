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

        // ── Per-zone delivery salary (admin-set) ─────────────────────────────────
        // Auto-applied to Order.CourierSalary when this courier is assigned (or admin-delivers) a
        // Send/Exchange order, picked by the recipient district's zone flags — the same
        // IsCapitalTerritory / IsCityTerritory split customer pricing uses. Resolved only through
        // Application.Couriers.CourierSalaryResolver. Null for the order's zone (or an unknown
        // district) means no auto-fill: the admin sets the salary on that order by hand.

        /// <summary>Salary per delivery to a capital (Tbilisi) district — <c>District.IsCapitalTerritory</c>.</summary>
        public decimal? CapitalSalary { get; set; }

        /// <summary>Salary per delivery to a non-capital city centre — <c>District.IsCityTerritory</c>.</summary>
        public decimal? CitySalary { get; set; }

        /// <summary>Salary per delivery to a village / rural district (neither flag set).</summary>
        public decimal? DistrictSalary { get; set; }

        // Identity link
        public required string ApplicationUserId { get; set; }
        public ApplicationUser ApplicationUser { get; set; } = null!;

        // Navigation
        public ICollection<Order>           Orders           { get; set; } = new List<Order>();
        public ICollection<GroupOrder>      GroupOrders      { get; set; } = new List<GroupOrder>();
    }
}
