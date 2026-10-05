using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.CreateGroupOrder;

public sealed class CreateGroupOrderCommandValidator : AbstractValidator<CreateGroupOrderCommand>
{
    public CreateGroupOrderCommandValidator(IAppDbContext context)
    {
        RuleFor(x => x.Dto).NotNull();
        RuleFor(x => x.Dto.SenderFirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.SenderLastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.SenderIdNumber).MaximumLength(50)
            .When(x => x.Dto.SenderIdNumber is not null);
        RuleFor(x => x.Dto.SenderBusinessName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Dto.SenderPhone).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Dto.AlternativeSenderPhone).MaximumLength(20)
            .When(x => !string.IsNullOrWhiteSpace(x.Dto.AlternativeSenderPhone));
        RuleFor(x => x.Dto.PickUpCity).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.PickUpDistrict).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.PickUpAddress).NotEmpty().MaximumLength(250);
        RuleFor(x => x.Dto.Note).MaximumLength(500).When(x => x.Dto.Note is not null);
        RuleFor(x => x.Dto.Orders)
            .NotEmpty().WithMessage("At least one order (package) is required.")
            .Must(o => o.Count <= 300).WithMessage("A single group order cannot exceed 300 packages.");
        RuleForEach(x => x.Dto.Orders).SetValidator(new CreateOrderDtoValidator(context));
    }
}

public sealed class CreateOrderDtoValidator : AbstractValidator<CreateOrderDto>
{
    private readonly IAppDbContext _context;

    public CreateOrderDtoValidator(IAppDbContext context)
    {
        _context = context;

        // Recipient name is optional — when left blank the UI shows a localized
        // "Unknown"/"უცნობი" placeholder. The phone stays required (delivery identifier).
        RuleFor(x => x.RecipientName).MaximumLength(201);
        RuleFor(x => x.RecipientPhone).NotEmpty().MaximumLength(20);

        RuleFor(x => x.RecipientCity)
            .NotEmpty().MaximumLength(100)
            .MustAsync(CityExistsAsync)
            .WithMessage("'{PropertyValue}' is not a valid city.")
            .When(x => !string.IsNullOrEmpty(x.RecipientCity));

        RuleFor(x => x.RecipientDistrict)
            .NotEmpty().MaximumLength(100)
            .MustAsync(DistrictExistsAsync)
            .WithMessage("'{PropertyValue}' is not a valid district in the selected city.")
            .When(x => !string.IsNullOrEmpty(x.RecipientCity) && !string.IsNullOrEmpty(x.RecipientDistrict));

        RuleFor(x => x.RecipientAddress).NotEmpty().MaximumLength(250);
        RuleFor(x => x.Description).MaximumLength(500).When(x => x.Description is not null);
        // 0 is an accepted "not set" value (district / customer / weight-tier price
        // wasn't configured) — an admin fills it in later. Only negatives are invalid.
        // Mirrors UpdateOrderCommandValidator, which already allows 0.
        RuleFor(x => x.CompanyServicePrice)
            .GreaterThanOrEqualTo(0).WithMessage("CompanyServicePrice cannot be negative.")
            .When(x => x.CompanyServicePrice.HasValue);
    }

    private Task<bool> CityExistsAsync(CreateOrderDto dto, string city, CancellationToken ct) =>
        _context.Cities.AnyAsync(c => c.CityName == city && c.DateDeleted == null, ct);

    private Task<bool> DistrictExistsAsync(CreateOrderDto dto, string district, CancellationToken ct) =>
        _context.Districts.AnyAsync(d =>
            d.DistrictName == district &&
            d.City.CityName == dto.RecipientCity &&
            d.DateDeleted == null, ct);
}