import { buildPinoOptions } from './logging.config';

/** Narrow the `pinoHttp` union to the options object. */
function opts(env: NodeJS.ProcessEnv = {}) {
  const { pinoHttp } = buildPinoOptions(env);
  return pinoHttp as Record<string, any>;
}

describe('buildPinoOptions', () => {
  it('defaults the level to info and reads LOG_LEVEL', () => {
    expect(opts({}).level).toBe('info');
    expect(opts({ LOG_LEVEL: 'debug' }).level).toBe('debug');
  });

  it('puts service + environment on the base, with fallbacks', () => {
    expect(opts({ SERVICE_NAME: 'api', APP_ENV: 'live' }).base).toEqual({
      service: 'api',
      environment: 'live',
    });
    expect(opts({}).base).toEqual({ service: 'unknown', environment: 'local' });
  });

  it('emits the string level label, not the numeric value', () => {
    expect(opts().formatters.level('warn')).toEqual({ level: 'warn' });
  });

  it('ignores health-probe paths in request logging', () => {
    const ignore = opts().autoLogging.ignore as (req: unknown) => boolean;
    expect(ignore({ url: '/api/v1/health' })).toBe(true);
    expect(ignore({ url: '/api/v1/health/ready' })).toBe(true);
    expect(ignore({ originalUrl: '/api/v1/health?x=1', url: '/health' })).toBe(true);
    expect(ignore({ url: '/api/v1/orders' })).toBe(false);
  });

  it('maps request-completion lines to levels — 5xx summaries stay warn (ProblemDetailsFilter owns error)', () => {
    const fn = opts().customLogLevel as (req: unknown, res: { statusCode: number }, err?: unknown) => string;
    expect(fn({}, { statusCode: 200 })).toBe('info');
    expect(fn({}, { statusCode: 404 })).toBe('warn');
    expect(fn({}, { statusCode: 503 })).toBe('warn');
    expect(fn({}, { statusCode: 200 }, new Error('boom'))).toBe('error');
  });

  it('req serializer strips the query string and drops sensitive headers', () => {
    const req = opts().serializers.req({
      method: 'GET',
      url: '/api/v1/deliveries/confirm?token=secret-abc',
      headers: { host: 'x', authorization: 'Bearer y', cookie: 'z', 'user-agent': 'ua' },
      remoteAddress: '10.0.0.1',
    });
    expect(req.url).toBe('/api/v1/deliveries/confirm');
    expect(req.headers).toEqual({ host: 'x', 'user-agent': 'ua' });
    expect(req.headers.authorization).toBeUndefined();
  });

  it('redacts the standard secret paths', () => {
    const paths = opts().redact.paths as string[];
    expect(paths).toEqual(
      expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token']),
    );
  });

  it('uses no transport unless LOG_PRETTY is explicitly set (never via isTTY)', () => {
    expect(opts({}).transport).toBeUndefined();
    expect(opts({ NODE_ENV: 'production' }).transport).toBeUndefined();
    expect(opts({ LOG_PRETTY: '1' }).transport).toMatchObject({ target: 'pino-pretty' });
  });
});
