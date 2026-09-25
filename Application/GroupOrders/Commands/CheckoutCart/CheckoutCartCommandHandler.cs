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

        // Customer-only endpoint — never trust a client-submitted CompanyServicePrice;
        // always re-derive it server-side.
        var built = await GroupOrderOrderBuilder.BuildAsync(
            _context, _trackingGen, customer, dto.Orders, cancellationToken, dto.PickUpDistrict,
            allowClientPriceOverride: false);

        // ── Split: Return orders are always standalone; Send/Exchange may batch.
        //    Mirrors CreateGroupOrderCommandHandler so a Return never lands inside a
        //    GroupOrder's pickup flow regardless of which entry point created it. ──
        var standaloneReturns = new List<Order>();
        var batchOrders       = new List<Order>();

        foreach (var order in built)
        {
            if (order.OrderType == OrderType.Return)
            {
                order.CustomerId = dto.CustomerId;
                standaloneReturns.Add(order);
                _context.Orders.Add(order);
            }
            else
            {
                batchOrders.Add(order);
            }
        }

        // ── Every Send/Exchange order always belongs to a GroupOrder — even a lone one.
        //    Same-day orders from this customer fold into their still-open batch (any
        //    GroupOrderAppendPolicy.Appendable status, i.e. before the courier marks it
        //    picked up) as long as the pickup address matches; otherwise a fresh batch
        //    is started, same as if no open batch existed. ──
        GroupOrder? groupOrder = null;
        var isNewGroupOrder = false;

        if (batchOrders.Count > 0)
        {
            if (dto.CustomerId is Guid customerId)
            {
                groupOrder = await OpenBatchResolver.FindOpenBatchAsync(
                    _context, customerId, dto.PickUpCity, dto.PickUpDistrict, dto.PickUpAddress, cancellationToken);
            }

            if (groupOrder is not null)
            {
                GroupOrderOrderBuilder.AttachToBatch(_context, groupOrder, batchOrders);
                groupOrder.NumberOfPackages += batchOrders.Count;
            }
            else
            {
                isNewGroupOrder = true;
                var (pickUpLat, pickUpLon) = PickupPin.ResolveForNewBatch(
                    customer, dto.PickUpCity, dto.PickUpDistrict, dto.PickUpAddress);
                groupOrder = new GroupOrder
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
                    PickUpLatitude     = pickUpLat,
                    PickUpLongitude    = pickUpLon,
                    Note               = dto.Note,
                    NumberOfPackages   = batchOrders.Count,
                };

                foreach (var order in batchOrders)
                    groupOrder.Orders.Add(order);

                _context.GroupOrders.Add(groupOrder);
            }
        }

        await _context.SaveChangesAsync(cancellationToken);

        // Only a genuinely new batch gets the admin SMS — packages silently folded into an
        // already-announced open batch don't need a second notification.
        if (isNewGroupOrder && groupOrder is not null)
        {
            try
            {
                await _adminSms.SendNewGroupOrderNotificationAsync(groupOrder, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Failed to send admin SMS notification for GroupOrder {GroupOrderId}", groupOrder.Id);
            }
        }

        return new CreateGroupOrderResultDto(
            GroupOrderId:       groupOrder?.Id ?? Guid.Empty,
            SenderBusinessName: groupOrder?.SenderBusinessName ?? dto.SenderBusinessName,
            Orders: built
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber, o.RecipientName))
                .ToList());
    }
}
