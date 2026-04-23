using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;
using System.Text;

namespace Domain
{
    public class ApplicationUser : IdentityUser
    {
        public required string FirstName { get; set; }
        public required string LastName { get; set; }
        /// <summary>Courier/WarehouseStaff/Admin/Customer</summary>
        public required string Role { get; set; }
    }
}
