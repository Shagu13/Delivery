using System;
using System.Collections.Generic;
using System.Text;

namespace Domain
{
    public class Warehouse
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public required string Name { get; set; }
        public required string City { get; set; }
        public required string Address { get; set; }
    }
}
