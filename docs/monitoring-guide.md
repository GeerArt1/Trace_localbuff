# TRACE Monitoring Guide

Prometheus + Grafana integration for the TRACE `/metrics` endpoint.

## Quick Start

```bash
# 1. Verify metrics are exposed
curl http://localhost:3000/metrics

# 2. Add to prometheus.yml
# 3. Import the Grafana dashboard below
```

## Available Metrics

The `/metrics` endpoint exposes all monitoring data in standard Prometheus text format.

### Server Info
| Metric | Type | Description |
|--------|------|-------------|
| `trace_uptime_seconds` | gauge | Server uptime in seconds |
| `trace_memory_rss_bytes` | gauge | Memory RSS in bytes |
| `trace_connections_active` | gauge | Active HTTP connections |
| `trace_sse_clients` | gauge | Connected SSE clients |
| `trace_errors_logged` | gauge | Total errors in error log |
| `trace_subscriptions` | gauge | Active subscriptions |
| `trace_license_keys` | gauge | License keys issued |

### AI Provider Health
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `trace_provider_healthy` | gauge | `provider` | 1=healthy, 0=degraded |
| `trace_provider_consecutive_errors` | gauge | `provider` | Consecutive errors |
| `trace_provider_total_errors` | gauge | `provider` | Lifetime errors |
| `trace_provider_degraded_until` | gauge | `provider` | Cooldown end timestamp |

### Disk Space
| Metric | Type | Description |
|--------|------|-------------|
| `trace_disk_total_bytes` | gauge | Total disk space |
| `trace_disk_available_bytes` | gauge | Available disk space |
| `trace_disk_free_bytes` | gauge | Free disk space |

### Database Files
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `trace_db_file_size_bytes` | gauge | `type` (primary, backup, wal) | DB file sizes |

### Credits
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `trace_credits_remaining` | gauge | `provider` | Remaining credits in USD |
| `trace_credits_total_usage` | gauge | `provider` | Total credit usage |

### Memory Trend
| Metric | Type | Description |
|--------|------|-------------|
| `trace_memory_trend_recent_mb` | gauge | Recent memory RSS in MB |
| `trace_memory_trend_slope_mb_per_hour` | gauge | Memory growth slope in MB/hour |
| `trace_memory_trend_leak_detected` | gauge | 1=leak suspected, 0=normal |

## Prometheus Configuration

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'trace'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
    # Optional: if using x-api-key auth for /metrics
    # authorization:
    #   credentials: 'your-analye-api-key'
```

For production deployments, add a reverse proxy auth layer:

```nginx
# nginx reverse proxy with basic auth
location /metrics {
    proxy_pass http://localhost:3000/metrics;
    auth_basic "TRACE Metrics";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```

## Grafana Dashboard

Import this dashboard JSON into Grafana (copy the block below, then Grafana → Dashboards → Import → Paste JSON):

<details>
<summary>📊 TRACE Art Intelligence — Grafana Dashboard JSON</summary>

```json
{
  "title": "TRACE Art Intelligence",
  "uid": "trace-art-intelligence",
  "tags": ["trace", "art-intelligence"],
  "schemaVersion": 38,
  "version": 1,
  "timezone": "browser",
  "panels": [
    {
      "title": "Server Uptime",
      "type": "stat",
      "gridPos": { "h": 4, "w": 4, "x": 0, "y": 0 },
      "targets": [{
        "expr": "trace_uptime_seconds",
        "legendFormat": "Uptime"
      }],
      "fieldConfig": {
        "defaults": {
          "unit": "s",
          "color": { "mode": "thresholds" },
          "thresholds": { "steps": [
            { "color": "red", "value": null },
            { "color": "yellow", "value": 60 },
            { "color": "green", "value": 3600 }
          ]}
        },
        "overrides": []
      },
      "options": {
        "colorMode": "background",
        "graphMode": "none",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
        "textMode": "auto"
      }
    },
    {
      "title": "Memory RSS",
      "type": "stat",
      "gridPos": { "h": 4, "w": 4, "x": 4, "y": 0 },
      "targets": [{
        "expr": "trace_memory_rss_bytes",
        "legendFormat": "RSS"
      }],
      "fieldConfig": {
        "defaults": {
          "unit": "bytes",
          "color": { "mode": "thresholds" },
          "thresholds": { "steps": [
            { "color": "green", "value": null },
            { "color": "yellow", "value": 209715200 },
            { "color": "red", "value": 314572800 }
          ]}
        }
      },
      "options": {
        "colorMode": "background",
        "graphMode": "none",
        "reduceOptions": { "calcs": ["lastNotNull"] },
        "textMode": "auto"
      }
    },
    {
      "title": "Active Connections",
      "type": "stat",
      "gridPos": { "h": 4, "w": 4, "x": 8, "y": 0 },
      "targets": [{
        "expr": "trace_connections_active",
        "legendFormat": "Connections"
      }],
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "thresholds": { "steps": [
            { "color": "green", "value": null },
            { "color": "yellow", "value": 50 },
            { "color": "red", "value": 100 }
          ]}
        }
      },
      "options": {
        "colorMode": "background",
        "graphMode": "none",
        "reduceOptions": { "calcs": ["lastNotNull"] },
        "textMode": "auto"
      }
    },
    {
      "title": "Errors Logged",
      "type": "stat",
      "gridPos": { "h": 4, "w": 4, "x": 12, "y": 0 },
      "targets": [{
        "expr": "trace_errors_logged",
        "legendFormat": "Errors"
      }],
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "thresholds": { "steps": [
            { "color": "green", "value": null },
            { "color": "yellow", "value": 10 },
            { "color": "red", "value": 50 }
          ]}
        }
      },
      "options": {
        "colorMode": "background",
        "graphMode": "none",
        "reduceOptions": { "calcs": ["lastNotNull"] },
        "textMode": "auto"
      }
    },
    {
      "title": "Subscriptions",
      "type": "stat",
      "gridPos": { "h": 4, "w": 4, "x": 16, "y": 0 },
      "targets": [{
        "expr": "trace_subscriptions",
        "legendFormat": "Subs"
      }],
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "thresholds": { "steps": [
            { "color": "dark-yellow", "value": null },
            { "color": "green", "value": 1 }
          ]}
        }
      },
      "options": {
        "colorMode": "background",
        "graphMode": "none",
        "reduceOptions": { "calcs": ["lastNotNull"] },
        "textMode": "auto"
      }
    },
    {
      "title": "SSE Clients",
      "type": "stat",
      "gridPos": { "h": 4, "w": 4, "x": 20, "y": 0 },
      "targets": [{
        "expr": "trace_sse_clients",
        "legendFormat": "SSE"
      }],
      "options": {
        "colorMode": "background",
        "graphMode": "none",
        "reduceOptions": { "calcs": ["lastNotNull"] },
        "textMode": "auto"
      }
    },
    {
      "title": "Provider Health",
      "type": "table",
      "gridPos": { "h": 10, "w": 12, "x": 0, "y": 4 },
      "targets": [{
        "expr": "trace_provider_healthy",
        "format": "table",
        "instant": true
      }],
      "transformations": [
        { "id": "organize", "options": { "excludeByName": { "Time": true, "Value": true, "__name__": true, "instance": true, "job": true }, "indexByName": { "provider": 0, "Value": 1 }, "renameByName": { "provider": "Provider", "Value": "Healthy" } } }
      ],
      "fieldConfig": {
        "defaults": {
          "mappings": [{ "type": "value", "options": { "0": { "text": "DEGRADED", "color": "red" }, "1": { "text": "HEALTHY", "color": "green" } } }]
        }
      }
    },
    {
      "title": "Provider Errors",
      "type": "bargauge",
      "gridPos": { "h": 10, "w": 12, "x": 12, "y": 4 },
      "targets": [{
        "expr": "trace_provider_total_errors",
        "legendFormat": "{{provider}}"
      }],
      "fieldConfig": {
        "defaults": {
          "unit": "none",
          "color": { "mode": "thresholds" },
          "thresholds": { "steps": [
            { "color": "green", "value": null },
            { "color": "yellow", "value": 5 },
            { "color": "red", "value": 20 }
          ]}
        }
      },
      "options": {
        "orientation": "horizontal",
        "displayMode": "gradient",
        "showUnfilled": true
      }
    },
    {
      "title": "Disk Space",
      "type": "gauge",
      "gridPos": { "h": 8, "w": 8, "x": 0, "y": 14 },
      "targets": [{
        "expr": "trace_disk_available_bytes",
        "legendFormat": "Available"
      }],
      "fieldConfig": {
        "defaults": {
          "unit": "bytes",
          "color": { "mode": "thresholds" },
          "thresholds": { "steps": [
            { "color": "red", "value": null },
            { "color": "orange", "value": 104857600 },
            { "color": "yellow", "value": 524288000 },
            { "color": "green", "value": 1073741824 }
          ]}
        }
      },
      "options": {
        "showThresholdLabels": true,
        "showThresholdMarkers": true
      }
    },
    {
      "title": "Memory Trend",
      "type": "graph",
      "gridPos": { "h": 8, "w": 8, "x": 8, "y": 14 },
      "targets": [
        { "expr": "trace_memory_trend_recent_mb", "legendFormat": "RSS (MB)" },
        { "expr": "trace_memory_trend_slope_mb_per_hour", "legendFormat": "Slope (MB/hr)" }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "short",
          "color": { "mode": "palette-classic" },
          "custom": { "axisCenteredZero": false, "axisColorMode": "text", "axisLabel": "", "axisPlacement": "auto", "barAlignment": 0, "drawStyle": "line", "fillOpacity": 10, "gradientMode": "none", "hideFrom": { "legend": false, "tooltip": false, "viz": false }, "lineInterpolation": "linear", "lineWidth": 2, "pointSize": 5, "scaleDistribution": { "type": "linear" }, "showPoints": "never", "spanNulls": false, "stacking": { "group": "A", "mode": "none" }, "thresholdsStyle": { "mode": "off" } }
        }
      },
      "options": { "legend": { "calcs": ["min", "max", "lastNotNull"], "displayMode": "table", "placement": "bottom", "showLegend": true } }
    },
    {
      "title": "Leak Detection",
      "type": "stat",
      "gridPos": { "h": 8, "w": 4, "x": 16, "y": 14 },
      "targets": [{
        "expr": "trace_memory_trend_leak_detected",
        "legendFormat": "Leak"
      }],
      "fieldConfig": {
        "defaults": {
          "mappings": [{ "type": "value", "options": { "0": { "text": "NORMAL", "color": "green" }, "1": { "text": "LEAK SUSPECTED", "color": "red" } } }]
        }
      },
      "options": {
        "colorMode": "background",
        "graphMode": "none",
        "reduceOptions": { "calcs": ["lastNotNull"] },
        "textMode": "auto"
      }
    },
    {
      "title": "Database File Sizes",
      "type": "bargauge",
      "gridPos": { "h": 8, "w": 8, "x": 0, "y": 22 },
      "targets": [{
        "expr": "trace_db_file_size_bytes",
        "legendFormat": "{{type}}"
      }],
      "fieldConfig": {
        "defaults": {
          "unit": "bytes",
          "color": { "mode": "thresholds" },
          "thresholds": { "steps": [
            { "color": "green", "value": null },
            { "color": "yellow", "value": 10485760 },
            { "color": "red", "value": 52428800 }
          ]}
        }
      },
      "options": {
        "orientation": "horizontal",
        "displayMode": "gradient",
        "showUnfilled": true
      }
    },
    {
      "title": "OpenRouter Credits",
      "type": "gauge",
      "gridPos": { "h": 8, "w": 8, "x": 8, "y": 22 },
      "targets": [{
        "expr": "trace_credits_remaining",
        "legendFormat": "Credits"
      }],
      "fieldConfig": {
        "defaults": {
          "unit": "currencyUSD",
          "color": { "mode": "thresholds" },
          "thresholds": { "steps": [
            { "color": "red", "value": null },
            { "color": "orange", "value": 5 },
            { "color": "yellow", "value": 20 },
            { "color": "green", "value": 50 }
          ]}
        }
      },
      "options": {
        "showThresholdLabels": true,
        "showThresholdMarkers": true,
        "reduceOptions": { "calcs": ["lastNotNull"] }
      }
    }
  ]
}
```

</details>

## Alert Rules

Add to your Prometheus alert manager:

```yaml
groups:
  - name: trace
    rules:
      - alert: TRACE_ProviderDegraded
        expr: trace_provider_healthy == 0
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Provider {{ $labels.provider }} is degraded"
          description: "Provider {{ $labels.provider }} has been degraded for over 5 minutes"

      - alert: TRACE_DiskSpaceLow
        expr: trace_disk_available_bytes < 524288000
        for: 2m
        labels: { severity: warning }
        annotations:
          summary: "Disk space low (< 500MB)"
          description: "Available disk space is below 500MB"

      - alert: TRACE_DiskSpaceCritical
        expr: trace_disk_available_bytes < 104857600
        for: 1m
        labels: { severity: critical }
        annotations:
          summary: "Disk space critical (< 100MB)"
          description: "Available disk space is below 100MB — act immediately"

      - alert: TRACE_MemoryLeak
        expr: trace_memory_trend_leak_detected == 1
        for: 15m
        labels: { severity: warning }
        annotations:
          summary: "Potential memory leak detected"
          description: "Memory trend analysis shows persistent RSS growth"

      - alert: TRACE_CreditsLow
        expr: trace_credits_remaining < 10
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "AI credits running low"
          description: "{{ $labels.provider }} credits below $10"

      - alert: TRACE_ServerDown
        expr: up{job="trace"} == 0
        for: 1m
        labels: { severity: critical }
        annotations:
          summary: "TRACE server is down"
          description: "TRACE server has been unreachable for over 1 minute"
```

## Grafana Cloud Quick Start

If using Grafana Cloud:

```bash
# 1. Install Prometheus agent
# https://grafana.com/docs/grafana-cloud/monitor-infrastructure/metrics/

# 2. Add to agent config
scrape_configs:
  - job_name: 'trace'
    static_configs:
      - targets: ['your-server:3000']
    metrics_path: '/metrics'

# 3. Import dashboard
# Grafana Cloud → Dashboards → Import → Paste JSON above
```

## Docker Compose

For a local Prometheus + Grafana stack alongside TRACE:

```yaml
services:
  trace:
    build: .
    ports: ["3000:3000"]
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./ops/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:latest
    ports: ["3001:3000"]
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_INSTALL_PLUGINS=
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:
```

Create `ops/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'trace'
    static_configs:
      - targets: ['trace:3000']
    metrics_path: '/metrics'
```
