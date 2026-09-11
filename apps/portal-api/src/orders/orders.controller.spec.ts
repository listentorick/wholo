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
  let ordersService: { submitOrder: jest.Mock };

  beforeEach(async () => {
    ordersService = { submitOrder: jest.fn().mockResolvedValue({ id: 'order-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    }).compile();

    controller = module.get(OrdersController);
  });

  it('forwards the validated dto and caller token to OrdersService', async () => {
    const dto = plainToInstance(SubmitOrderDto, {
      distributorSlug: 'dist',
      requestedDeliveryDate: '2024-06-14',
    });
    const req = { user: { token: 'test-token' } } as unknown as import('express').Request;

    const result = await controller.submitOrder(dto, req);

    expect(ordersService.submitOrder).toHaveBeenCalledWith(dto, 'test-token');
    expect(result).toEqual({ id: 'order-1' });
  });
});
