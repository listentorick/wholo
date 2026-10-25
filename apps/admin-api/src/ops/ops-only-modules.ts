import { AppMode } from '../auth/app-mode';
import { OpsModule } from './ops.module';

/** Modules that exist only in the Ops deployment (ADR-078). The admin app gets none. */
export function opsOnlyModules(mode: AppMode) {
  return mode === 'ops' ? [OpsModule] : [];
}
