import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { logHttpException } from '@wholo/nest-telemetry';
import { Response } from 'express';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let detail = 'An unexpected error occurred';
    let title = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const r = exceptionResponse as Record<string, unknown>;
        detail = (r['message'] as string) ?? exception.message;
        title = (r['error'] as string) ?? exception.message;
      } else {
        detail = exceptionResponse as string;
        title = exception.message;
      }
    } else if (exception instanceof Error && (exception as any).status) {
      status = (exception as any).status;
      detail = exception.message;
      title = exception.message;
    }

    // ADR-064: this filter is @Catch()-all and writes the response itself, which
    // pre-empts Nest's built-in exception logging — so log 5xx (with stack) here.
    // Logged BEFORE the response so a failure writing the response is still
    // captured; guarded so a failure logging can never block the response.
    try {
      logHttpException(this.logger, exception, status, host);
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('ProblemDetailsFilter: logging failed', logErr);
    }

    response.status(status).set('Content-Type', 'application/problem+json').json({
      type: `https://wholo.app/errors/${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      status,
      detail,
    });
  }
}
