using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.Shared;
using Application.GroupOrders.DTOs;
using Domain;
using Domain.Enums;
using FluentValidation.Results;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.AdminCreateWalkInOrder;

public sealed class AdminCreateWalkInOrderCommandHandler
    : IRequestHandler<AdminCreateWalkInOrderCommand, CreateGroupOrderResultDto>
{
    private readonly IAppDbContext _context;
    private readonly ITrackingNumberGenerator _trackingGen;

    public AdminCreateWalkInOrderCommandHandler(
        IAppDbContext context,
        ITrackingNumberGenerator trackingGen)
    {
        _context     = context;
        _trackingGen = trackingGen;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        AdminCreateWalkInOrderCommand request,
        CancellationToken cancellationToken)
    {
        var dto = request.Dto;

        // ── 1. Resolve the customer ─────────────────────────────────────────────
        Customer customer;

        if (dto.ExistingCustomerId is Guid existingId)
        {
            // Admin picked a suggested customer — place the order against it as stored.
            customer = await _context.Customers
                .FirstOrDefaultAsync(c => c.Id == existingId, cancellationToken)
                ?? throw new NotFoundException(nameof(Customer), existingId);
        }
        else
        {
            var nc     = dto.NewCustomer!;   // guaranteed by the validator
            var phone  = nc.PhoneNumber.Trim();
            var idNum  = nc.IdNumber.Trim();
            var biz    = nc.BusinessName.Trim();

            // Manual entry: reuse an existing customer only on an exact phone + ID number
            // + business name match; otherwise create a new account-less row.
            customer = await _context.Customers.FirstOrDefaultAsync(
                c => c.PhoneNumber == phone && c.IdNumber == idNum && c.BusinessName == biz,
                cancellationToken);

            if (customer is null)
            {
                // Business name stays globally unique — surface the same sentinel error
                // the registration path uses so the client maps it to a friendly message.
                var bizTaken = await _context.Customers
                    .AnyAsync(c => c.BusinessName == biz, cancellationToken);
                if (bizTaken)
                    throw new ValidationException(new[]
                    {
                        new ValidationFailure("DuplicateBusinessName",
                            "This business name is already registered.")
                    });

                customer = new Customer
                {
                    FirstName         = nc.FirstName.Trim(),
                    LastName          = nc.LastName.Trim(),
                    IdNumber          = idNum,
                    BusinessName      = biz,
                    PhoneNumber       = phone,
                    City              = nc.City.Trim(),
                    District          = nc.District.Trim(),
                    Address           = nc.Address.Trim(),
                    ApplicationUserId = null,   // walk-in: no account until they register
                    TenantId          = null,   // root brand
                    IsActive          = true,
                };
                _context.Customers.Add(customer);
            }
        }

        // ── 2. Build the Order entities (fee resolution, tracking numbers) ──────
        var built = await GroupOrderOrderBuilder.BuildAsync(
            _context, _trackingGen, customer, dto.Orders, cancellationToken, customer.District);

        var now = CustomTime.Now;

        var batchOrders       = new List<Order>();
        var standaloneReturns = new List<Order>();

        foreach (var order in built)
        {
            if (order.OrderType == OrderType.Return)
            {
                // Standalone Return — normal flow, a pickup courier is assigned afterwards.
                order.CustomerId = customer.Id;
                order.Status     = OrderStatus.Pending;
                standaloneReturns.Add(order);
                _context.Orders.Add(order);
            }
            else
            {
                // Send / Exchange — physically received at the office, so straight to the
                // warehouse-accepted state, ready for last-mile assignment.
                order.Status = OrderStatus.AdminAcceptedOrderInWareHouse;
                batchOrders.Add(order);
            }
        }

        // ── 3. One GroupOrder for the Send/Exchange packages ───────────────────
        GroupOrder? groupOrder = null;
        if (batchOrders.Count > 0)
        {
            groupOrder = new GroupOrder
            {
                CustomerId             = customer.Id,
                SenderFirstName        = customer.FirstName,
                SenderLastName         = customer.LastName,
                SenderIdNumber         = customer.IdNumber,
                SenderBusinessName     = customer.BusinessName,
                SenderPhone            = customer.PhoneNumber,
                PickUpCity             = customer.City,
                PickUpDistrict         = customer.District,
                PickUpAddress          = customer.Address,
                NumberOfPackages       = batchOrders.Count,
                Status                 = OrderStatus.AdminAcceptedOrderInWareHouse,
                // The batch skipped the pickup leg — stamp the timestamps as "now" so the
                // pickup trace isn't blank on the admin/customer views.
                CreatedAt              = now,
                AcceptedAt             = now,
                PickedUpAt             = now,
                DeliveredToWarehouseAt = now,
            };

            foreach (var order in batchOrders)
                groupOrder.Orders.Add(order);

            _context.GroupOrders.Add(groupOrder);
        }

        await _context.SaveChangesAsync(cancellationToken);

        var allOrders = batchOrders.Concat(standaloneReturns).ToList();

        return new CreateGroupOrderResultDto(
            GroupOrderId:       groupOrder?.Id ?? Guid.Empty,
            SenderBusinessName: customer.BusinessName,
            Orders: allOrders
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber, o.RecipientName))
                .ToList()
        );
    }
}
