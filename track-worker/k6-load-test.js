// TRACK Worker — k6 Load Test Script
//
// Run: k6 run k6-load-test.js
//
// Tests the most critical code-path endpoints under load:
//   /health       — baseline latency check
//   /verify       — multi-module integration (classify + score + RKD + danger)
//   /danger-check — provenance analysis (pure function, no IO)
//   /style-database — data lookup (pure function, no IO)
//   /oeuvre       — Oeuvre matching engine (pure function, no IO)
//   /reference    — RKD artist lookup (pure function, no IO)
//
// Does NOT test AI endpoints (they require API keys) or search (requires eBay).
// For AI/search performance tests, run against a deployed worker with secrets.

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────

const errorRate = new Rate('errors');
const latencyHealth = new Trend('latency_health');
const latencyVerify = new Trend('latency_verify');
const latencyDanger = new Trend('latency_danger');
const latencyStyle = new Trend('latency_style');
const latencyOeuvre = new Trend('latency_oeuvre');
const latencyReference = new Trend('latency_reference');

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://track-ebay-proxy.geerart.workers.dev';

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp up to 10 VUs
    { duration: '1m', target: 50 }, // Ramp to 50 VUs
    { duration: '2m', target: 50 }, // Stay at 50 VUs
    { duration: '30s', target: 0 }, // Ramp down
  ],
  thresholds: {
    errors: ['rate<0.05'], // < 5% error rate
    latency_health: ['p(95)<200'], // 95% of health requests < 200ms
    latency_verify: ['p(95)<500'], // 95% of verify < 500ms
    latency_danger: ['p(95)<300'], // 95% of danger-check < 300ms
    latency_oeuvre: ['p(95)<300'], // 95% of oeuvre < 300ms
  },
};

// ── Test data ─────────────────────────────────────────────────────────────────

const verifyQueries = [
  '?title=Rubens%20oil%20sketch%20modello&artist=Rubens',
  '?title=Van%20Dyck%20painting%20portrait&artist=Van%20Dyck',
  '?title=Jordaens%20allegory%2017th%20century&artist=Jordaens',
  '?title=Massacre%20of%20the%20Innocents&artist=Rubens',
];

const oeuvreQueries = ['rubens', 'van%20dyck', 'jordaens'];

const styleQueries = ['Rubens', 'Van%20Dyck', 'Jordaens'];

const dangerQueries = [
  '?provenance=forced%20sale%201933&seller_country=DE',
  '?provenance=church%20monastery%20painting&seller_country=BE',
  '?provenance=flemish%20antwerp%20collection&seller_country=FR',
  '?provenance=jewish%20collection%201940&seller_country=PL',
];

// ── Main test ─────────────────────────────────────────────────────────────────

export default function () {
  group('Health endpoint', () => {
    const res = http.get(`${BASE_URL}/health`);
    latencyHealth.add(res.timings.duration);
    const ok = check(res, {
      'health status 200': (r) => r.status === 200,
      'health returns ok': (r) => r.json('status') === 'ok',
      'health has version': (r) => r.json('version') === '2.3',
    });
    if (!ok) errorRate.add(1);
    sleep(0.5);
  });

  group('Verify endpoint', () => {
    const q = verifyQueries[Math.floor(Math.random() * verifyQueries.length)];
    const res = http.get(`${BASE_URL}/verify${q}`);
    latencyVerify.add(res.timings.duration);
    const ok = check(res, {
      'verify status 200': (r) => r.status === 200,
      'verify has artist': (r) => r.json('artist') !== null,
      'verify has title_analysis': (r) => r.json('title_analysis') !== null,
    });
    if (!ok) errorRate.add(1);
    sleep(0.5);
  });

  group('Danger-check endpoint', () => {
    const q = dangerQueries[Math.floor(Math.random() * dangerQueries.length)];
    const res = http.get(`${BASE_URL}/danger-check${q}`);
    latencyDanger.add(res.timings.duration);
    const ok = check(res, {
      'danger status 200': (r) => r.status === 200,
      'danger has seller_country': (r) => r.json('seller_country') !== '',
      'danger has periods': (r) => Array.isArray(r.json('danger_periods')),
    });
    if (!ok) errorRate.add(1);
    sleep(0.3);
  });

  group('Style database endpoint', () => {
    const artist = styleQueries[Math.floor(Math.random() * styleQueries.length)];
    const res = http.get(`${BASE_URL}/style-database?artist=${artist}`);
    latencyStyle.add(res.timings.duration);
    const ok = check(res, {
      'style status 200': (r) => r.status === 200,
      'style found': (r) => r.json('found') === true,
      'style has periods': (r) => r.json('periods') !== null,
    });
    if (!ok) errorRate.add(1);
    sleep(0.3);
  });

  group('Oeuvre endpoint', () => {
    const artist = oeuvreQueries[Math.floor(Math.random() * oeuvreQueries.length)];
    const res = http.get(`${BASE_URL}/oeuvre?artist=${artist}`);
    latencyOeuvre.add(res.timings.duration);
    const ok = check(res, {
      'oeuvre status 200': (r) => r.status === 200,
      'oeuvre found': (r) => r.json('found') === true,
      'oeuvre has artist name': (r) => r.json('artist') !== '',
    });
    if (!ok) errorRate.add(1);
    sleep(0.3);
  });

  group('Reference endpoint', () => {
    const res = http.get(`${BASE_URL}/reference?artist=Rubens`);
    latencyReference.add(res.timings.duration);
    const ok = check(res, {
      'reference status 200': (r) => r.status === 200,
      'reference found': (r) => r.json('found') === true,
      'reference has RKD url': (r) => r.json('artist.rkd_url') !== undefined,
    });
    if (!ok) errorRate.add(1);
    sleep(0.3);
  });
}
