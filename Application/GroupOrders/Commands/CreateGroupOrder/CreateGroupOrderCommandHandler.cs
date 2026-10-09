using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Application.GroupOrders.Commands.Shared;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Application.GroupOrders.Commands.CreateGroupOrder;

public sealed class CreateGroupOrderCommandHandler
    : IRequestHandler<CreateGroupOrderCommand, CreateGroupOrderResultDto>
{
    private readonly IAppDbContext _context;
    private readonly ITrackingNumberGenerator _trackingGen;
    private readonly IAdminNotificationSmsService _adminSms;
    private readonly ILogger<CreateGroupOrderCommandHandler> _logger;

    public CreateGroupOrderCommandHandler(
        IAppDbContext context,
        ITrackingNumberGenerator trackingGen,
        IAdminNotificationSmsService adminSms,
        ILogger<CreateGroupOrderCommandHandler> logger)
    {
        _context     = context;
        _trackingGen = trackingGen;
        _adminSms    = adminSms;
        _logger      = logger;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        CreateGroupOrderCommand request,
        CancellationToken cancellationToken)
    {
        var dto = request.Dto;

        // Load customer to check negotiated price tiers / all-in pricing flag.
        var customer = dto.CustomerId.HasValue
            ? await _context.Customers
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == dto.CustomerId.Value, cancellationToken)
            : null;

        // Customer web + Partner API are the only callers of this command — never trust a
        // client-submitted CompanyServicePrice; always re-derive it server-side.
        var built = await GroupOrderOrderBuilder.BuildAsync(
            _context, _trackingGen, customer, dto.Orders, cancellationToken, dto.PickUpDistrict,
            allowClientPriceOverride: false, pickUpCityName: dto.PickUpCity);

        // ── Split: Return orders become standalone; Send/Exchange go into a GroupOrder ──
        var standaloneReturns = new List<Order>();
        var batchOrders       = new List<Order>();

        foreach (var order in built)
        {
            if (order.OrderType == OrderType.Return)
            {
                // Standalone — not part of the GroupOrder pickup flow. Returns are only
                // ever created by a logged-in customer, so CustomerId is always present.
                order.CustomerId = dto.CustomerId!.Value;
                standaloneReturns.Add(order);
                _context.Orders.Add(order);
            }
            else
            {
                batchOrders.Add(order);
            }
        }

        // ── Batch (GroupOrder) for the Send/Exchange packages ─────────────────────
        //    Same-day orders from this sender fold into their still-open batch at the
        //    same pickup address; otherwise a fresh batch is started. Identical to the
        //    cart checkout path, so a partner pushing orders through the day builds up
        //    one pickup per address instead of one per API call. ──
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
            }
            else
            {
                isNewGroupOrder = true;
                groupOrder = CreateNewBatch(dto, customer);

                foreach (var order in batchOrders)
                    groupOrder.Orders.Add(order);
            }

            groupOrder.NumberOfPackages += batchOrders.Count;
        }

        await _context.SaveChangesAsync(cancellationToken);

        // ── Notify admin via SMS ──────────────────────────────────────────────────
        //    Only a genuinely new batch is announced — packages folded into an already
        //    announced open batch don't need a second notification.
        if (isNewGroupOrder && groupOrder is not null)
        {
            try
            {
                await _adminSms.SendNewGroupOrderNotificationAsync(groupOrder, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to send admin SMS notification for GroupOrder {GroupOrderId}",
                    groupOrder.Id);
            }
        }

        var allOrders = batchOrders.Concat(standaloneReturns).ToList();

        return new CreateGroupOrderResultDto(
            GroupOrderId:       groupOrder?.Id ?? Guid.Empty,
            SenderBusinessName: groupOrder?.SenderBusinessName ?? dto.SenderBusinessName,
            Orders: allOrders
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber, o.RecipientName))
                .ToList()
        );
    }

    private GroupOrder CreateNewBatch(CreateGroupOrderDto dto, Customer? customer)
    {
        var (pickUpLat, pickUpLon) = PickupPin.ResolveForNewBatch(
            customer, dto.PickUpCity, dto.PickUpDistrict, dto.PickUpAddress);

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
            PickUpLatitude     = pickUpLat,
            PickUpLongitude    = pickUpLon,
            Note               = dto.Note,
            NumberOfPackages   = 0,
        };
        _context.GroupOrders.Add(groupOrder);
        return groupOrder;
    }
}
