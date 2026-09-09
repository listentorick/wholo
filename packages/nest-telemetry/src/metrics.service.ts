import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dgram from 'node:dgram';

type StatsdType = 'c' | 'ms' | 'g';

/**
 * Platform telemetry over StatsD (ADR-062 business activity, ADR-063 platform
 * health).
 *
 * Emits InfluxDB-style StatsD lines over UDP to the in-cluster Telegraf, which
 * aggregates them and forwards to InfluxDB 2. Stocdup holds no InfluxDB
 * credentials and no InfluxDB/StatsD client library — a single UDP datagram is
 * the whole dependency surface, so we build the wire format by hand:
 *
 *   stocdup_orders_submitted,environment=live,distributor_id=123:1|c
 *   stocdup_http_request_ms,environment=live,service=api:42|ms
 *   stocdup_queue_jobs,environment=live,queue=notifications,state=failed:3|g
 *
 * Every call is fire-and-forget: non-blocking, never throws, never awaited. A
 * send failure is logged (message only — never tag values or payload data) and
 * dropped. Delivery is deliberately not guaranteed (ADR-062).
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
  increment(name: string, value: number, tags: Record<string, string> = {}): void {
    this.emit('c', name, Number.isFinite(value) ? Math.trunc(value) : 0, tags);
  }

  /**
   * Record a duration sample in milliseconds. Telegraf's statsd input turns the
   * stream of samples per tag-set into `_count` / `_mean` / `95_percentile`
   * fields per flush window. Fire-and-forget.
   */
  timing(name: string, ms: number, tags: Record<string, string> = {}): void {
    this.emit('ms', name, Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0, tags);
  }

  /**
   * Set an absolute gauge value. Negative values clamp to 0 — a leading `-` is
   * a StatsD gauge *delta*, which is never what a caller means here.
   * Fire-and-forget.
   */
  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    this.emit('g', name, Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0, tags);
  }

  onApplicationShutdown(): void {
    this.socket?.close();
  }

  private emit(type: StatsdType, name: string, n: number, tags: Record<string, string>): void {
    if (!this.socket || !this.host) return;
    try {
      const packet = this.format(name, n, tags, type);
      this.socket.send(packet, this.port, this.host, (err) => {
        if (err) this.logger.warn(`StatsD send failed for ${name}: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(`StatsD emit failed for ${name}: ${(err as Error).message}`);
    }
  }

  /** `name,tag=value,tag=value:<n>|<type>`, every segment sanitised to stay on one line. */
  private format(name: string, n: number, tags: Record<string, string>, type: StatsdType): string {
    const metric = sanitiseName(name);
    const allTags: Record<string, string> = { environment: this.environment, ...tags };
    const tagPart = Object.entries(allTags)
      .map(([k, v]) => `,${sanitiseName(k)}=${sanitiseTagValue(v)}`)
      .join('');
    return `${metric}${tagPart}:${n}|${type}`;
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
