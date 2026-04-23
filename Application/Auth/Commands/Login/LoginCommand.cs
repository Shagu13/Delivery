using Application.Auth.DTOs;
using MediatR;
using System;
using System.Collections.Generic;
using System.Text;

namespace Application.Auth.Commands.Login
{
    public sealed record LoginCommand(
    string Username,
    string Password
) : IRequest<LoginResultDto>;
}
