using FluentValidation;
using System;
using System.Collections.Generic;
using System.Text;

namespace Application.Auth.Commands.Login
{
    public sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
    {
        public LoginCommandValidator()
        {
            RuleFor(x => x.Username).NotEmpty().MaximumLength(100);
            RuleFor(x => x.Password).NotEmpty().MaximumLength(100);
        }
    }
}
