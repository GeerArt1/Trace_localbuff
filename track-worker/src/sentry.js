/**
 * TRACK Worker v2.3 — Sentry Error Tracking Integration
 *
 * Thin pass-through to @sentry/cloudflare's withSentry() wrapper.
 * Follows the exact Sentry docs pattern — no custom wrapper, let Sentry
 * handle unhandled exceptions naturally.
 *
 * Usage in index.js:
 *   import { withSentry } from './sentry.js';
 *   export default withSentry({ fetch, scheduled });
 *
 * Secrets:
 *   SENTRY_DSN — Sentry project DSN
 *   SENTRY_ENVIRONMENT — 'production' | 'staging' | 'development'
 *   SENTRY_SAMPLE_RATE — trace sample rate (default: 0.1)
 */

import * as Sentry from '@sentry/cloudflare';

/**
 * Wrap a Cloudflare Worker export object with Sentry error tracking.
 * Passes through directly to @sentry/cloudflare's withSentry().
 *
 * @param {Object} handlers - { fetch, scheduled } worker handlers
 * @returns {Object} Handlers wrapped with Sentry instrumentation
 */
export function withSentry(handlers) {
  return Sentry.withSentry(
    (env) => ({
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT || 'production',
      tracesSampleRate: env.SENTRY_SAMPLE_RATE ? parseFloat(env.SENTRY_SAMPLE_RATE) : 0.1,
    }),
    handlers,
  );
}
