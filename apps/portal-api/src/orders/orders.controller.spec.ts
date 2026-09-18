import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrdersController, SubmitOrderDto } from './orders.controller';
import { OrdersService } from './orders.service';

describe('SubmitOrderDto', () => {
  it('rejects a payload missing requestedDeliveryDate', async () => {
    const dto = plainToInstance(SubmitOrderDto, { distributorSlug: 'dist' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('requestedDeliveryDate');
  });

  it('rejects a non-date string for requestedDeliveryDate', async () => {
    const dto = plainToInstance(SubmitOrderDto, {
      distributorSlug: 'dist',
      requestedDeliveryDate: 'not-a-date',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('requestedDeliveryDate');
  });

  it('accepts a valid submission', async () => {
    const dto = plainToInstance(SubmitOrderDto, {
      distributorSlug: 'dist',
      requestedDeliveryDate: '2024-06-14',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersService: { submitOrder: jest.Mock; listOrders: jest.Mock; getOrder: jest.Mock; cancelOrder: jest.Mock };

  beforeEach(async () => {
    ordersService = {
      submitOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
      listOrders: jest.fn().mockResolvedValue({ data: [] }),
      getOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
      cancelOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    }).compile();

    controller = module.get(OrdersController);
  });

  const req = {
    user: { token: 'test-token', organisationId: 'org-1' },
  } as unknown as import('express').Request & { user: { token: string; organisationId: string } };

  it('forwards the validated dto and caller token to OrdersService', async () => {
    const dto = plainToInstance(SubmitOrderDto, {
      distributorSlug: 'dist',
      requestedDeliveryDate: '2024-06-14',
    });

    const result = await controller.submitOrder(dto, req);

    expect(ordersService.submitOrder).toHaveBeenCalledWith(dto, 'test-token');
    expect(result).toEqual({ id: 'order-1' });
  });

  it('forwards the caller organisationId, query and token to OrdersService for listing', async () => {
    await controller.listOrders({ status: 'SUBMITTED' }, req);

    expect(ordersService.listOrders).toHaveBeenCalledWith('org-1', { status: 'SUBMITTED' }, 'test-token');
  });

  it('forwards order id and token when fetching a single order', async () => {
    await controller.getOrder('order-1', req);

    expect(ordersService.getOrder).toHaveBeenCalledWith('order-1', 'test-token');
  });

  it('forwards order id, body and token when cancelling', async () => {
    const body = { reason: 'Changed mind' };

    await controller.cancelOrder('order-1', body, req);

    expect(ordersService.cancelOrder).toHaveBeenCalledWith('order-1', body, 'test-token');
  });
});
