import { Job } from 'bullmq';
import { KeycloakAdminService } from './keycloak-admin.service';
import { StaffKeycloakDisableProcessor } from './staff-keycloak-disable.processor';
import { PrismaService } from '../prisma/prisma.service';

const job = (name: string, payload: unknown = { userId: 'u1', keycloakId: 'kc-1' }) =>
  ({ name, data: { eventId: 'evt-1', aggregateType: 'User', aggregateId: 'u1', payload } }) as unknown as Job<any>;

describe('StaffKeycloakDisableProcessor', () => {
  let processor: StaffKeycloakDisableProcessor;
  let disabled: string[];
  let user: { deletedAt: Date | null; keycloakId: string | null } | null;

  beforeEach(() => {
    disabled = [];
    user = { deletedAt: new Date(), keycloakId: 'kc-1' };
    processor = new StaffKeycloakDisableProcessor(
      { user: { findUnique: jest.fn(async () => user) } } as unknown as PrismaService,
      { disableUser: jest.fn(async (id: string) => void disabled.push(id)) } as unknown as KeycloakAdminService,
    );
  });

  it('disables the Keycloak account of a removed user', async () => {
    await processor.process(job('StaffKeycloakDisableRequested'));
    expect(disabled).toEqual(['kc-1']);
  });

  it('does nothing for a user who is no longer removed', async () => {
    user = { deletedAt: null, keycloakId: 'kc-1' };
    await processor.process(job('StaffKeycloakDisableRequested'));
    expect(disabled).toEqual([]);
  });

  it('does nothing if the user no longer exists', async () => {
    user = null;
    await processor.process(job('StaffKeycloakDisableRequested'));
    expect(disabled).toEqual([]);
  });

  it('disables the identity on record, not one supplied in the event', async () => {
    user = { deletedAt: new Date(), keycloakId: 'kc-on-record' };
    await processor.process(job('StaffKeycloakDisableRequested', { userId: 'u1', keycloakId: 'kc-forged' }));
    expect(disabled).toEqual(['kc-on-record']);
  });

  it('skips events without a user or Keycloak id, and unknown event types', async () => {
    await processor.process(job('StaffKeycloakDisableRequested', { userId: 'u1' }));
    await processor.process(job('SomethingElse'));
    expect(disabled).toEqual([]);
  });
});
