import { readFileSync } from 'fs';
import { join } from 'path';
import { opsOnlyModules } from './ops-only-modules';
import { OpsModule } from './ops.module';

// Guard rail (ADR-078): the /ops endpoints exist only in the Ops deployment.
describe('opsOnlyModules', () => {
  it('gives the admin app no /ops routes', () => {
    expect(opsOnlyModules('admin')).toEqual([]);
  });

  it('gives the Ops app its routes', () => {
    expect(opsOnlyModules('ops')).toEqual([OpsModule]);
  });

  it('is the only way AppModule takes in OpsModule', () => {
    const source = readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8');
    expect(source).toContain('...opsOnlyModules(appMode())');
    expect(source).not.toMatch(/ops\/ops\.module/);
  });
});
