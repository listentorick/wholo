import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderQueryDto } from './order-query.dto';

const parse = async (query: Record<string, string>) => {
  const dto = plainToInstance(OrderQueryDto, query);
  return { dto, errors: await validate(dto) };
};

describe('OrderQueryDto payment', () => {
  it('reads one or several comma-separated payment positions', async () => {
    expect((await parse({ payment: 'UNPAID' })).dto.payment).toEqual(['UNPAID']);
    expect((await parse({ payment: 'UNPAID,OVERDUE' })).dto.payment).toEqual(['UNPAID', 'OVERDUE']);
  });

  it('rejects an unknown payment position', async () => {
    const { errors } = await parse({ payment: 'UNPAID,SOMETIMES' });
    expect(errors.map((e) => e.property)).toContain('payment');
  });
});
