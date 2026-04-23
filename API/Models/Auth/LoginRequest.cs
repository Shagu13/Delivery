namespace API.Models.Auth
{
    public sealed record LoginRequest
        (
    string Username,
    string Password
        );
}
