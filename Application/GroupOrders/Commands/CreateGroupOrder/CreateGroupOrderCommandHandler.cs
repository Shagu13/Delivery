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
    /// <summary>Georgia uses UTC+4 year-round (no DST), so "today" is computed against this offset.</summary>
    private const int GeorgiaUtcOffsetHours = 4;

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

        var built = await GroupOrderOrderBuilder.BuildAsync(
            _context, _trackingGen, customer, dto.Orders, cancellationToken);

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

        // ── Merge into an open same-day batch, or create a fresh GroupOrder ────────
        GroupOrder? groupOrder    = null;
        bool mergedIntoExisting   = false;

        if (batchOrders.Count > 0)
        {
            if (dto.MergeIntoOpenBatch && dto.CustomerId.HasValue)
            {
                groupOrder = await FindOpenBatchAsync(dto, cancellationToken);
                mergedIntoExisting = groupOrder is not null;
            }

            groupOrder ??= CreateNewBatch(dto);

            // Add the orders explicitly with their FK set rather than via the navigation
            // collection. When merging into an existing (already-tracked) batch, attaching
            // a child whose client-generated Id is non-default makes EF treat it as an
            // existing row → UPDATE (0 rows) → DbUpdateConcurrencyException. An explicit
            // Add marks them Added so they INSERT correctly for both new and merged batches.
            foreach (var order in batchOrders)
            {
                order.GroupOrderId = groupOrder.Id;
                _context.Orders.Add(order);
            }

            groupOrder.NumberOfPackages += batchOrders.Count;
        }

        await _context.SaveChangesAsync(cancellationToken);

        // ── Create / refresh per-batch customer invoices ──────────────────────────
        // Send/Exchange batch → one invoice (recomputed from all its orders).
        // Each standalone Return → its own invoice (only when the sender pays the fee).
        if (groupOrder is not null && groupOrder.CustomerId.HasValue)
            await CustomerSettlementService.UpsertForGroupOrderAsync(_context, groupOrder.Id, cancellationToken);

        foreach (var ret in standaloneReturns)
            await CustomerSettlementService.UpsertForReturnOrderAsync(_context, ret, cancellationToken);

        // ── Notify admin via SMS ──────────────────────────────────────────────────
        // Only for a brand-new batch — merging into today's batch reuses the original
        // notification rather than pinging the admin again for every added package.
        if (groupOrder is not null && !mergedIntoExisting)
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

    /// <summary>
    /// Finds the customer's open batch from today (Georgia local day) whose pickup
    /// location and sender identity match the new order, so same-day shipments collapse
    /// into one GroupOrder until a courier is assigned. Null when none qualifies.
    /// </summary>
    private async Task<GroupOrder?> FindOpenBatchAsync(CreateGroupOrderDto dto, CancellationToken ct)
    {
        var nowGe       = DateTime.UtcNow.AddHours(GeorgiaUtcOffsetHours);
        var dayStartUtc = nowGe.Date.AddHours(-GeorgiaUtcOffsetHours);
        var dayEndUtc   = dayStartUtc.AddDays(1);

        var appendable = GroupOrderAppendPolicy.Appendable.ToArray();

        return await _context.GroupOrders
            .Where(g => g.CustomerId == dto.CustomerId
                && appendable.Contains(g.Status)
                && g.CreatedAt >= dayStartUtc && g.CreatedAt < dayEndUtc
                && g.PickUpCity      == dto.PickUpCity
                && g.PickUpDistrict  == dto.PickUpDistrict
                && g.PickUpAddress   == dto.PickUpAddress
                && g.SenderBusinessName == dto.SenderBusinessName
                && g.SenderPhone        == dto.SenderPhone
                && g.SenderFirstName    == dto.SenderFirstName
                && g.SenderLastName     == dto.SenderLastName)
            .OrderByDescending(g => g.CreatedAt)
            .FirstOrDefaultAsync(ct);
    }

    private GroupOrder CreateNewBatch(CreateGroupOrderDto dto)
    {
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
            NumberOfPackages   = 0,
        };
        _context.GroupOrders.Add(groupOrder);
        return groupOrder;
    }
}
