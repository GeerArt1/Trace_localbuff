// TRACE Events Routes — telemetry event logging
const { sendJSON } = require('./helpers');

const EVENT_MAX = 50;
const EVENT_MAX_BYTES = 512;
const eventLog = [];

module.exports = function(ctx) {
  const { checkRateLimitWithHeaders } = ctx;

  function handleEvents(req, res, body) {
    if (req.method === 'POST') {
      if (!checkRateLimitWithHeaders(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown', req)) {
        return sendJSON(res, 429, { error: 'Rate limit exceeded' });
      }
      try {
        const event = JSON.parse(body);
        event.timestamp = new Date().toISOString();
        ['message', 'screen', 'tier', 'type'].forEach(field => {
          if (event[field]) {
            event[field] = String(event[field]).slice(0, field === 'message' ? 500 : 50).replace(/<[^>]*>/g, '');
          }
        });
        eventLog.push(event);
        if (eventLog.length > EVENT_MAX) eventLog.shift();
        sendJSON(res, 200, { ok: true });
      } catch(e) {
        sendJSON(res, 400, { error: 'Invalid event' });
      }
      return;
    }
    // GET /events
    sendJSON(res, 200, { events: eventLog.slice(-50) });
  }

  return { handleEvents, eventLog, EVENT_MAX };
};
