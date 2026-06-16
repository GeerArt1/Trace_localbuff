# ══════════════════════════════════════════════
# TRACE API Proxy — Docker Multi-Stage Build
# ══════════════════════════════════════════════

# ── Stage 1: Build ──
FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# ── Stage 2: Production ──
FROM node:26-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -S trace && adduser -S trace -G trace

# Copy only production deps and app code
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/trace_server.js ./
COPY --from=build /app/trace_db.js ./
COPY --from=build /app/trace_subscription.js ./
COPY --from=build /app/trace_sw.js ./
COPY --from=build /app/trace.css ./
COPY --from=build /app/trace.html ./
COPY --from=build /app/trace_hq.html ./
COPY --from=build /app/trace_cluster.js ./
COPY --from=build /app/manifest.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/routes ./routes
COPY --from=build /app/ops ./ops
USER trace
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:3000/health || exit 1

CMD ["node", "trace_server.js"]
