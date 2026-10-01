using System.Text.Json;
using Application.Common.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.LabelDesigns.Commands;

/// <summary>Creates or replaces the caller's saved label settings (one row per user).</summary>
public sealed record SaveLabelDesignCommand(string UserId, string PrefsJson) : IRequest;

public sealed class SaveLabelDesignCommandValidator : AbstractValidator<SaveLabelDesignCommand>
{
    public const int MaxPrefsLength = 4000;

    public SaveLabelDesignCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.PrefsJson)
            .NotEmpty()
            .MaximumLength(MaxPrefsLength)
            .Must(BeJsonObject).WithMessage("Prefs must be a JSON object.");
    }

    private static bool BeJsonObject(string json)
    {
        try
        {
            using JsonDocument doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Object;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}

public sealed class SaveLabelDesignCommandHandler : IRequestHandler<SaveLabelDesignCommand>
{
    private readonly IAppDbContext _context;
    public SaveLabelDesignCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SaveLabelDesignCommand request, CancellationToken cancellationToken)
    {
        Domain.LabelDesign? row = await _context.LabelDesigns
            .FirstOrDefaultAsync(d => d.OwnerUserId == request.UserId, cancellationToken);

        if (row is null)
        {
            _context.LabelDesigns.Add(new Domain.LabelDesign
            {
                OwnerUserId = request.UserId,
                PrefsJson   = request.PrefsJson,
            });
        }
        else
        {
            row.PrefsJson = request.PrefsJson;
            row.UpdatedAt = Domain.CustomTime.Now;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
