// TRACE Timeline Routes — provenance timeline persistence
const { sendJSON, log } = require('./helpers');

module.exports = function(ctx) {
  const { db } = ctx;

  function handleTimelineSave(req, res, body) {
    try {
      const data = JSON.parse(body);
      if (!data.title || typeof data.title !== 'string') {
        return sendJSON(res, 400, { error: 'Timeline title required' });
      }
      const timeline = {
        title: data.title,
        sub: data.sub || '',
        type: data.type || 'artwork',
        events: Array.isArray(data.events) ? data.events : [],
        artist: data.artist || '',
        period: data.period || '',
        savedAt: Date.now()
      };
      if (db && db.isReady()) db.saveTimeline(timeline);
      log('INFO', 'Timeline saved: ' + data.title);
      sendJSON(res, 200, { ok: true, title: data.title });
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid request: ' + e.message });
    }
  }

  function handleTimelineList(req, res) {
    var tls = (db && db.isReady()) ? db.loadAllTimelines() : {};
    var timelines = Object.keys(tls).map(function(key) {
      var t = tls[key];
      return {
        title: t.title || key,
        sub: t.sub || '',
        type: t.type || 'artwork',
        events: Array.isArray(t.events) ? t.events : [],
        artist: t.artist || '',
        period: t.period || '',
        savedAt: t.savedAt || 0
      };
    });
    timelines.sort(function(a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    sendJSON(res, 200, { timelines: timelines, count: timelines.length });
  }

  function handleTimelineDelete(req, res, body) {
    try {
      const data = JSON.parse(body);
      if (!data.title) {
        return sendJSON(res, 400, { error: 'Timeline title required' });
      }
      if (db && db.isReady()) db.deleteTimeline(data.title);
      log('INFO', 'Timeline deleted: ' + data.title);
      sendJSON(res, 200, { ok: true });
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid request: ' + e.message });
    }
  }

  return { handleTimelineSave, handleTimelineList, handleTimelineDelete };
};
