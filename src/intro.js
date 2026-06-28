// ══════════════════════════════════════════════
// TRACE — Intro Animation (Canvas)
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var canvas = document.getElementById('intro-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W, H, animId, done = false, startTs = null;

  function resize() {
    W = canvas.width = canvas.offsetWidth || window.innerWidth || 390;
    H = canvas.height = canvas.offsetHeight || window.innerHeight || 844;
  }

  function drawTrace(alpha, glow) {
    var ofc = document.createElement('canvas');
    ofc.width = W;
    ofc.height = H;
    var o = ofc.getContext('2d');
    var fSize = Math.round(W * 0.185);
    o.font = '400 ' + fSize + 'px \'Cormorant Garamond\',serif';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillStyle = '#fff';
    o.fillText('TRACE', W * 0.5, H * 0.5);
    o.globalCompositeOperation = 'source-in';
    var grad = o.createLinearGradient(W * 0.05, H * 0.38, W * 0.95, H * 0.62);
    grad.addColorStop(0, 'rgba(255,248,190,' + alpha + ')');
    grad.addColorStop(0.06, 'rgba(252,235,155,' + alpha + ')');
    grad.addColorStop(0.18, 'rgba(242,212,115,' + alpha + ')');
    grad.addColorStop(0.35, 'rgba(226,188,78,' + alpha + ')');
    grad.addColorStop(0.52, 'rgba(208,168,58,' + alpha + ')');
    grad.addColorStop(0.70, 'rgba(185,145,40,' + alpha + ')');
    grad.addColorStop(0.85, 'rgba(160,122,28,' + alpha + ')');
    grad.addColorStop(1, 'rgba(130,96,16,' + alpha + ')');
    o.fillStyle = grad;
    o.fillRect(0, 0, W, H);
    ctx.save();
    if (glow > 0) {
      ctx.shadowColor = 'rgba(255,200,80,' + (glow * 0.85) + ')';
      ctx.shadowBlur = Math.round(36 * glow);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(ofc, 0, 0);
    if (glow > 0) {
      ctx.shadowBlur = Math.round(16 * glow);
      ctx.drawImage(ofc, 0, 0);
    }
    ctx.restore();
  }

  function getLetterBounds() {
    var fSize = Math.round(W * 0.185);
    var ofc = document.createElement('canvas');
    ofc.width = W;
    ofc.height = H;
    var o = ofc.getContext('2d');
    o.font = '400 ' + fSize + 'px \'Cormorant Garamond\',serif';
    var metrics = o.measureText('TRACE');
    var tw = metrics.width;
    var left = (W - tw) / 2;
    var right = (W + tw) / 2;
    var mid = H * 0.5;
    var cap = fSize * 0.72;
    var desc = fSize * 0.18;
    var top = mid - cap;
    var bottom = mid + desc;
    var gap = 22;
    var tagH = 16;
    var underY = Math.round(bottom + gap + tagH + gap);
    return { top: top, bottom: bottom, left: left, right: right, underY: underY, lw: tw };
  }

  function frame(ts) {
    if (done) return;
    if (!startTs) startTs = ts;
    var e = ts - startTs;

    resize();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#050403';
    ctx.fillRect(0, 0, W, H);

    // Soft central glow
    if (e > 300) {
      var ga = Math.min(0.08, (e - 300) / 1500 * 0.08);
      var gg = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.55);
      gg.addColorStop(0, 'rgba(212,174,82,' + ga + ')');
      gg.addColorStop(1, 'rgba(5,4,3,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, W, H);
    }

    var FIS = 300, FIE = 1500, HE = 2800, FOE = 3500;
    var SS = 1500, SE = 2600;
    var SL = 2600;

    var alpha = 0;
    if (e >= FIS && e < FIE) alpha = (e - FIS) / (FIE - FIS);
    else if (e >= FIE && e < HE) alpha = 1;
    else if (e >= HE && e < FOE) alpha = 1 - (e - HE) / (FOE - HE);

    if (alpha > 0) drawTrace(alpha, Math.min(0.55, alpha * 0.55));

    var bounds = getLetterBounds();
    var lw = bounds.lw;

    // Scan sweep
    if (e >= SS && e < SE) {
      var t = (e - SS) / (SE - SS);
      var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var scanY = bounds.top + (bounds.underY - bounds.top) * ease;

      var sg = ctx.createLinearGradient(bounds.left, 0, bounds.right, 0);
      sg.addColorStop(0, 'rgba(212,174,82,0)');
      sg.addColorStop(0.04, 'rgba(228,188,80,' + (0.5 * alpha) + ')');
      sg.addColorStop(0.2, 'rgba(255,240,140,' + (0.92 * alpha) + ')');
      sg.addColorStop(0.5, 'rgba(255,255,200,' + alpha + ')');
      sg.addColorStop(0.8, 'rgba(255,240,140,' + (0.92 * alpha) + ')');
      sg.addColorStop(0.96, 'rgba(228,188,80,' + (0.5 * alpha) + ')');
      sg.addColorStop(1, 'rgba(212,174,82,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(bounds.left, scanY - 1, lw, 2);

      var gg2 = ctx.createLinearGradient(0, scanY, 0, scanY + 24);
      gg2.addColorStop(0, 'rgba(255,220,80,' + (0.15 * alpha) + ')');
      gg2.addColorStop(1, 'rgba(255,220,80,0)');
      ctx.fillStyle = gg2;
      ctx.fillRect(bounds.left, scanY + 1, lw, 24);
    }

    // Settled line
    if (e >= SL) {
      var progress = Math.min(1, (e - SL) / 180);
      var lineAlpha = progress * (e < HE ? 1 : Math.max(0, 1 - (e - HE) / (FOE - HE)));
      if (lineAlpha > 0) {
        var sg2 = ctx.createLinearGradient(bounds.left, 0, bounds.right, 0);
        sg2.addColorStop(0, 'rgba(212,174,82,0)');
        sg2.addColorStop(0.06, 'rgba(212,174,82,' + (lineAlpha * 0.65) + ')');
        sg2.addColorStop(0.3, 'rgba(232,196,90,' + (lineAlpha * 0.88) + ')');
        sg2.addColorStop(0.5, 'rgba(248,220,110,' + lineAlpha + ')');
        sg2.addColorStop(0.7, 'rgba(232,196,90,' + (lineAlpha * 0.88) + ')');
        sg2.addColorStop(0.94, 'rgba(212,174,82,' + (lineAlpha * 0.65) + ')');
        sg2.addColorStop(1, 'rgba(212,174,82,0)');
        ctx.fillStyle = sg2;
        ctx.fillRect(bounds.left, bounds.underY, lw, 1.5);
        if (lineAlpha > 0.5) {
          ctx.shadowColor = 'rgba(232,196,90,' + ((lineAlpha - 0.5) * 0.4) + ')';
          ctx.shadowBlur = 4;
          ctx.fillRect(bounds.left, bounds.underY, lw, 1.5);
          ctx.shadowBlur = 0;
        }
      }
    }

    // Tagline visibility — appears after scan bar completes (SE=2600)
    if (e > 2700 && e < FOE) {
      var tagline = document.getElementById('cin-tagline');
      if (tagline) tagline.classList.add('visible');
    }

    // At 3.5s: logo exits, content rises
    if (e >= FOE) {
      done = true;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#050403';
      ctx.fillRect(0, 0, W, H);
      var logo = document.getElementById('cin-logo');
      if (logo) {
        logo.style.transition = 'opacity .5s ease,transform .6s cubic-bezier(0.16,1,0.3,1)';
        logo.style.opacity = '0';
        logo.style.transform = 'translateY(-28px)';
      }
      setTimeout(function() {
        var cc = document.getElementById('cin-content');
        if (cc) cc.classList.add('risen');
      }, 450);
      setTimeout(function() {
        var cs1 = document.getElementById('cs1');
        if (cs1) cs1.classList.add('visible');
      }, 750);
      setTimeout(function() {
        var cs2 = document.getElementById('cs2');
        if (cs2) cs2.classList.add('visible');
      }, 1000);
      setTimeout(function() {
        var cs = document.getElementById('cin-stats');
        if (cs) cs.classList.add('visible');
      }, 1220);
      setTimeout(function() {
        var ca = document.getElementById('cin-actions');
        if (ca) ca.classList.add('visible');
      }, 1420);
      return;
    }
    animId = requestAnimationFrame(frame);
  }

  function start() {
    resize();
    window.addEventListener('resize', resize);
    animId = requestAnimationFrame(frame);
  }

  // Auto-start handled by registry lifecycle init

  window._cancelIntro = function _cancelIntro(skip) {
    done = true;
    if (animId) cancelAnimationFrame(animId);
    ctx.clearRect(0, 0, W, H);
    var logo = document.getElementById('cin-logo');
    if (logo) {
      logo.style.transition = 'opacity .3s ease';
      logo.style.opacity = '0';
    }
    if (!skip) {
      setTimeout(function() {
        var cc = document.getElementById('cin-content');
        if (cc) cc.classList.add('risen');
        var cs1 = document.getElementById('cs1');
        if (cs1) cs1.classList.add('visible');
        var cs2 = document.getElementById('cs2');
        if (cs2) cs2.classList.add('visible');
        var cs = document.getElementById('cin-stats');
        if (cs) cs.classList.add('visible');
        var ca = document.getElementById('cin-actions');
        if (ca) ca.classList.add('visible');
      }, 200);
    }
  };
})();

/**
 * Skip the intro animation and go to home
 */
window.skipIntro = function skipIntro() {
  if (window._cancelIntro) window._cancelIntro(true);
  var intro = document.getElementById('s-intro');
  if (intro) {
    intro.classList.add('exiting');
    setTimeout(function() {
      intro.style.display = 'none';
      intro.classList.remove('active', 'exiting');
      if (typeof window.nav === 'function') window.nav('home');
    }, 420);
  }
};

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('intro', {
    version: '1.0.0',
    dependsOn: ['utils'],
    init: start
  });
}

console.log('[TRACE Intro] Loaded');
