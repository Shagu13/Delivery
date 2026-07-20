using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Application.GroupOrders.Commands.Shared;
using Application.GroupOrders.DTOs;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Application.GroupOrders.Commands.AddOrdersToGroupOrder;

public sealed class AddOrdersToGroupOrderCommandHandler
    : IRequestHandler<AddOrdersToGroupOrderCommand, CreateGroupOrderResultDto>
{
    private readonly IAppDbContext _context;
    private readonly ITrackingNumberGenerator _trackingGen;
    private readonly IRealtimeNotifier _notifier;
    private readonly IAdminNotificationSmsService _adminSms;
    private readonly ILogger<AddOrdersToGroupOrderCommandHandler> _logger;

    public AddOrdersToGroupOrderCommandHandler(
        IAppDbContext context,
        ITrackingNumberGenerator trackingGen,
        IRealtimeNotifier notifier,
        IAdminNotificationSmsService adminSms,
        ILogger<AddOrdersToGroupOrderCommandHandler> logger)
    {
        _context     = context;
        _trackingGen = trackingGen;
        _notifier    = notifier;
        _adminSms    = adminSms;
        _logger      = logger;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        AddOrdersToGroupOrderCommand request,
        CancellationToken cancellationToken)
    {
        var targetBatch = await _context.GroupOrders
            .FirstOrDefaultAsync(g => g.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        if (targetBatch.CustomerId != request.CustomerId)
            throw new ForbiddenException("You can only add packages to your own batch.");

        // ── Find-or-create: adding a package never fails just because the batch the
        //    customer came from has closed. If it was picked up between opening the
        //    dashboard and submitting, the packages go to whichever batch is still open
        //    for today at the same pickup address, or start a fresh one. ──
        var isNewBatch = false;
        GroupOrder groupOrder;

        if (GroupOrderAppendPolicy.Appendable.Contains(targetBatch.Status))
        {
            groupOrder = targetBatch;
        }
        else
        {
            var openBatch = await OpenBatchResolver.FindOpenBatchAsync(
                _context,
                request.CustomerId,
                targetBatch.PickUpCity,
                targetBatch.PickUpDistrict,
                targetBatch.PickUpAddress,
                cancellationToken);

            if (openBatch is not null)
            {
                groupOrder = openBatch;
            }
            else
            {
                isNewBatch = true;
                groupOrder = StartNextBatchFrom(targetBatch);
                _context.GroupOrders.Add(groupOrder);
            }
        }

        // Price against the batch owner's negotiated tiers / all-in pricing flag.
        var customer = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken);

        var built = await GroupOrderOrderBuilder.BuildAsync(
            _context, _trackingGen, customer, request.Orders, cancellationToken, groupOrder.PickUpDistrict);

        // Returns are rejected by the validator, so every built order is a Send/Exchange
        // package that joins the batch and adopts its current status.
        GroupOrderOrderBuilder.AttachToBatch(_context, groupOrder, built);

        groupOrder.NumberOfPackages += built.Count;

        await _context.SaveChangesAsync(cancellationToken);

        // A genuinely new batch needs its own pickup announcement — packages folded into
        // an already-announced open batch don't (mirrors CheckoutCartCommandHandler).
        if (isNewBatch)
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

        // Let open admin dashboards pick up the larger package count live.
        _notifier.NotifyAdminsOrdersChanged();

        return new CreateGroupOrderResultDto(
            GroupOrderId:       groupOrder.Id,
            SenderBusinessName: groupOrder.SenderBusinessName,
            Orders: built
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber, o.RecipientName))
                .ToList()
        );
    }

    /// <summary>
    /// Opens today's next batch for the same sender and pickup location, used when every
    /// batch the customer had today has already been picked up. Assignment fields
    /// (courier, warehouse, timestamps) deliberately start empty — this is a new pickup
    /// the admin has not seen yet.
    /// </summary>
    private static GroupOrder StartNextBatchFrom(GroupOrder previous) => new()
    {
        CustomerId             = previous.CustomerId,
        SenderFirstName        = previous.SenderFirstName,
        SenderLastName         = previous.SenderLastName,
        SenderIdNumber         = previous.SenderIdNumber,
        SenderBusinessName     = previous.SenderBusinessName,
        SenderPhone            = previous.SenderPhone,
        AlternativeSenderPhone = previous.AlternativeSenderPhone,
        PickUpCity             = previous.PickUpCity,
        PickUpDistrict         = previous.PickUpDistrict,
        PickUpAddress          = previous.PickUpAddress,
        Note                   = previous.Note,
        NumberOfPackages       = 0,
    };
}
