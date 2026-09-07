import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dgram from 'node:dgram';

/**
 * Platform-operator business-activity telemetry (ADR-062).
 *
 * Emits StatsD counters over UDP to the in-cluster Telegraf, which aggregates
 * them and forwards to InfluxDB 2. Stocdup holds no InfluxDB credentials and no
 * InfluxDB/StatsD client library — a single UDP datagram is the whole
 * dependency surface, so we build the wire format by hand.
 *
 * Wire format is the InfluxDB-style StatsD line Telegraf's `inputs.statsd`
 * parses natively:
 *
 *   stocdup_orders_submitted,environment=live,distributor_id=123:1|c
 *
 * Every call is fire-and-forget: non-blocking, never throws, never awaited. A
 * send failure is logged (message only — never tag values or order data) and
 * dropped. Delivery is deliberately not guaranteed (see ADR-062 / the PBI's
 * out-of-scope list).
 *
 * Disabled (no-op) whenever STATSD_HOST is unset — the default locally and in
 * tests, mirroring how MailService treats an absent SMTP host.
 */
@Injectable()
export class MetricsService implements OnApplicationShutdown {
  private readonly logger = new Logger(MetricsService.name);
  private readonly socket: dgram.Socket | null;
  private readonly host: string | undefined;
  private readonly port: number;
  private readonly environment: string;

  constructor(config: ConfigService) {
    this.environment = config.get<string>('APP_ENV', 'local');
    this.host = config.get<string>('STATSD_HOST') || undefined;
    const parsedPort = Number(config.get<string>('STATSD_PORT', '8125'));
    this.port = Number.isInteger(parsedPort) ? parsedPort : 8125;

    if (!this.host) {
      this.socket = null;
      this.logger.log('StatsD disabled (STATSD_HOST unset) — metrics are a no-op');
      return;
    }

    this.socket = dgram.createSocket('udp4');
    // The metrics socket must never keep the process alive on its own.
    this.socket.unref();
    this.socket.on('error', (err) => {
      this.logger.warn(`StatsD socket error: ${err.message}`);
    });
    this.logger.log(`StatsD enabled → ${this.host}:${this.port} (environment=${this.environment})`);
  }

  /**
   * Increment a counter by `value`, tagged with `tags` plus the ambient
   * `environment`. Fire-and-forget: returns immediately, never throws.
   */
  increment(name: string, value: number, tags: Record<string, string>): void {
    if (!this.socket || !this.host) return;
    try {
      const packet = this.formatCounter(name, value, tags);
      this.socket.send(packet, this.port, this.host, (err) => {
        if (err) this.logger.warn(`StatsD send failed for ${name}: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(`StatsD increment failed for ${name}: ${(err as Error).message}`);
    }
  }

  onApplicationShutdown(): void {
    this.socket?.close();
  }

  /** `name,tag=value,tag=value:<n>|c`, every segment sanitised to stay on one line. */
  private formatCounter(name: string, value: number, tags: Record<string, string>): string {
    const metric = sanitiseName(name);
    const allTags: Record<string, string> = { environment: this.environment, ...tags };
    const tagPart = Object.entries(allTags)
      .map(([k, v]) => `,${sanitiseName(k)}=${sanitiseTagValue(v)}`)
      .join('');
    const n = Number.isFinite(value) ? Math.trunc(value) : 0;
    return `${metric}${tagPart}:${n}|c`;
  }
}

/** Metric names and tag keys: strict identifier charset. */
function sanitiseName(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 64) || '_';
}

/**
 * Tag values: allow letters, digits, space, dot, hyphen (distributor names);
 * collapse everything else — crucially the line-protocol break characters
 * `, = : |` and whitespace — to `_`, then cap the length so a pathological
 * value can't bloat the datagram or InfluxDB's series index.
 */
function sanitiseTagValue(value: string): string {
  return (
    (value ?? '')
      .replace(/[^A-Za-z0-9 ._-]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'unknown'
  );
}
