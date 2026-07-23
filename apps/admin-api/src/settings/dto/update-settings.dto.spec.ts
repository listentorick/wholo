import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSettingsDto } from './update-settings.dto';

describe('UpdateSettingsDto', () => {
  it('accepts UTC as a valid timezone', async () => {
    const dto = plainToInstance(UpdateSettingsDto, { timezone: 'UTC' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts a standard IANA timezone', async () => {
    const dto = plainToInstance(UpdateSettingsDto, { timezone: 'Europe/London' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-IANA timezone string', async () => {
    const dto = plainToInstance(UpdateSettingsDto, { timezone: 'Not/AZone' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('timezone');
  });
});
