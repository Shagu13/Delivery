using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Application.GroupOrders.Commands.Shared;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Application.GroupOrders.Commands.CheckoutCart;

public sealed class CheckoutCartCommandHandler
    : IRequestHandler<CheckoutCartCommand, CreateGroupOrderResultDto>
{
    private readonly IAppDbContext _context;
    private readonly ITrackingNumberGenerator _trackingGen;
    private readonly IAdminNotificationSmsService _adminSms;
    private readonly ILogger<CheckoutCartCommandHandler> _logger;

    public CheckoutCartCommandHandler(
        IAppDbContext context,
        ITrackingNumberGenerator trackingGen,
        IAdminNotificationSmsService adminSms,
        ILogger<CheckoutCartCommandHandler> logger)
    {
        _context     = context;
        _trackingGen = trackingGen;
        _adminSms    = adminSms;
        _logger      = logger;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        CheckoutCartCommand request,
        CancellationToken cancellationToken)
    {
        var dto = request.Dto;

        // Load customer for negotiated price tiers / all-in pricing flag.
        var customer = dto.CustomerId.HasValue
            ? await _context.Customers
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == dto.CustomerId.Value, cancellationToken)
            : null;

        var built = await GroupOrderOrderBuilder.BuildAsync(
            _context, _trackingGen, customer, dto.Orders, cancellationToken);

        // ── Single package → standalone (admin links it to a batch later) ─────────
        if (built.Count == 1)
        {
            var order = built[0];
            order.CustomerId = dto.CustomerId;
            _context.Orders.Add(order);

            await _context.SaveChangesAsync(cancellationToken);

            // A standalone Return whose sender pays the fee already carries its own
            // per-order invoice. Send/Exchange singles hold no invoice until an admin
            // groups them — UpsertForReturnOrderAsync no-ops on those, so it is safe
            // to call for every type.
            await CustomerSettlementService.UpsertForReturnOrderAsync(_context, order, cancellationToken);

            return new CreateGroupOrderResultDto(
                GroupOrderId:       Guid.Empty,
                SenderBusinessName: dto.SenderBusinessName,
                Orders: built
                    .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber, o.RecipientName))
                    .ToList());
        }

        // ── Two or more packages → one new GroupOrder holding them all ────────────
        var groupOrder = new GroupOrder
        {
            CustomerId         = dto.CustomerId,
            SenderFirstName    = dto.SenderFirstName,
            SenderLastName     = dto.SenderLastName,
            SenderIdNumber     = dto.SenderIdNumber,
            SenderBusinessName = dto.SenderBusinessName,
            SenderPhone        = dto.SenderPhone,
            AlternativeSenderPhone = string.IsNullOrWhiteSpace(dto.AlternativeSenderPhone)
                ? null
                : dto.AlternativeSenderPhone.Trim(),
            PickUpCity         = dto.PickUpCity,
            PickUpDistrict     = dto.PickUpDistrict,
            PickUpAddress      = dto.PickUpAddress,
            Note               = dto.Note,
            NumberOfPackages   = built.Count,
        };

        foreach (var order in built)
            groupOrder.Orders.Add(order);

        _context.GroupOrders.Add(groupOrder);
        await _context.SaveChangesAsync(cancellationToken);

        if (groupOrder.CustomerId.HasValue)
            await CustomerSettlementService.UpsertForGroupOrderAsync(_context, groupOrder.Id, cancellationToken);

        try
        {
            await _adminSms.SendNewGroupOrderNotificationAsync(groupOrder, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to send admin SMS notification for GroupOrder {GroupOrderId}", groupOrder.Id);
        }

        return new CreateGroupOrderResultDto(
            GroupOrderId:       groupOrder.Id,
            SenderBusinessName: groupOrder.SenderBusinessName,
            Orders: built
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber, o.RecipientName))
                .ToList());
    }
}
