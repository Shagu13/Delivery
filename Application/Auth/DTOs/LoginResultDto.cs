using System;
using System.Collections.Generic;
using System.Text;

namespace Application.Auth.DTOs
{
    public sealed record LoginResultDto(
    string Token,
    string Username,
    string FirstName,
    string LastName,
    string Role,
    DateTime ExpiresAt
);
}
