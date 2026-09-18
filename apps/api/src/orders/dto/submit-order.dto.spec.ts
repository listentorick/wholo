import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitOrderDto } from './submit-order.dto';

describe('SubmitOrderDto', () => {
  it('rejects a payload missing requestedDeliveryDate', async () => {
    const dto = plainToInstance(SubmitOrderDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('requestedDeliveryDate');
  });

  it('rejects a non-date string for requestedDeliveryDate', async () => {
    const dto = plainToInstance(SubmitOrderDto, {
      requestedDeliveryDate: 'not-a-date',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('requestedDeliveryDate');
  });

  it('accepts a valid ISO date string for requestedDeliveryDate', async () => {
    const dto = plainToInstance(SubmitOrderDto, {
      requestedDeliveryDate: '2024-06-14',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
