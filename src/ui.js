// TRACE — UX Enhancements: Toasts, Loading, Keyboard Shortcuts, Onboarding Tour
// Single module for all user-facing polish

(function() {
  'use strict';

  // ── 1. Toast Notification System ──
  var toastTimer = null;

  window.showToast = function showToast(msg, type) {
    type = type || 'info';
    var el = document.getElementById('trace-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'trace-toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast toast-' + type;
    // Force reflow
    void el.offsetWidth;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      el.classList.remove('show');
    }, 2800);
  };

  window.showToastSuccess = function(msg) { window.showToast(msg, 'success'); };
  window.showToastError = function(msg) { window.showToast(msg, 'error'); };
  window.showToastInfo = function(msg) { window.showToast(msg, 'info'); };

  // ── 2. Loading Overlay ──
  var loadingCount = 0;

  window.showLoading = function showLoading(msg) {
    msg = msg || 'Loading...';
    loadingCount++;
    var overlay = document.getElementById('trace-loading');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'trace-loading';
      var bg = document.createElement('div');
      bg.className = 'loading-bg';
      overlay.appendChild(bg);
      var content = document.createElement('div');
      content.className = 'loading-content';
      var spinner = document.createElement('div');
      spinner.className = 'loading-spinner';
      for (var i = 0; i < 3; i++) {
        var dot = document.createElement('div');
        spinner.appendChild(dot);
      }
      content.appendChild(spinner);
      var text = document.createElement('div');
      text.className = 'loading-text';
      text.id = 'trace-loading-text';
      text.textContent = msg;
      content.appendChild(text);
      overlay.appendChild(content);
      document.body.appendChild(overlay);
    } else {
      overlay.style.display = 'flex';
      document.getElementById('trace-loading-text').textContent = msg;
    }
  };

  window.hideLoading = function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) {
      var overlay = document.getElementById('trace-loading');
      if (overlay) overlay.style.display = 'none';
    }
  };

  window.withLoading = function withLoading(promise, msg) {
    window.showLoading(msg);
    return promise.then(function(r) { window.hideLoading(); return r; })
      .catch(function(e) { window.hideLoading(); throw e; });
  };

  // ── 3. Keyboard Shortcuts ──
  document.addEventListener('keydown', function(e) {
    // Don't trigger when typing in inputs
    var tag = (e.target || {}).tagName || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case 'Escape':
        // Close any open modal or overlay
        var modals = document.querySelectorAll('.modal-overlay.show, .zoom-overlay.show');
        if (modals.length) {
          modals.forEach(function(m) { m.classList.remove('show'); m.style.display = 'none'; });
          e.preventDefault();
        }
        break;

      case 'H':
        if (!e.ctrlKey && !e.metaKey && e.shiftKey) {
          if (typeof window.nav === 'function') { window.nav('home'); e.preventDefault(); }
        }
        break;

      case 'S':
        if (!e.ctrlKey && !e.metaKey && e.shiftKey) {
          if (typeof window.nav === 'function') { window.nav('scan'); e.preventDefault(); }
        }
        break;

      case 'C':
        if (!e.ctrlKey && !e.metaKey && e.shiftKey) {
          if (typeof window.nav === 'function') { window.nav('cases'); e.preventDefault(); }
        }
        break;

      case 'I':
        if (!e.ctrlKey && !e.metaKey && e.shiftKey) {
          if (typeof window.nav === 'function') { window.nav('investigation'); e.preventDefault(); }
        }
        break;

      case 'P':
        if (!e.ctrlKey && !e.metaKey && e.shiftKey) {
          if (typeof window.nav === 'function') { window.nav('profile'); e.preventDefault(); }
        }
        break;
    }

    // Ctrl/Cmd+S = Save/Export
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      window.showToast('Press Esc to close, H=Home S=Scan C=Cases I=Investigation P=Profile', 'info');
    }
  });

  // ── 4. Onboarding Tour ──
  var tourSteps = [
    {
      selector: '#scan-cta',
      title: 'Scan Artwork',
      text: 'Take a photo or upload an image to analyze any artwork. Start here!',
      placement: 'bottom'
    },
    {
      selector: '#nav-scan',
      title: 'Navigation',
      text: 'Use this bar to switch between Scan, Cases, Investigation, and Profile.',
      placement: 'top'
    },
    {
      selector: '.nav-cases-btn, #nav-cases',
      title: 'Your Cases',
      text: 'Save and organize your findings. Revisit past investigations anytime.',
      placement: 'top'
    },
    {
      selector: '.nav-investigation-btn, #nav-investigation, #investigation-btn',
      title: 'Investigation Workspace',
      text: 'Deep-dive into provenance chains, cross-reference databases, and build evidence.',
      placement: 'top'
    }
  ];
  var tourStep = -1;
  var tourActive = false;

  window.startTour = function startTour() {
    tourStep = -1;
    tourActive = true;
    window._tourNext();
  };

  function buildTourArrow() {
    var arrow = document.createElement('div');
    arrow.className = 'tour-arrow';
    return arrow;
  }

  window._tourNext = function _tourNext() {
    // Remove existing tour popup
    var old = document.getElementById('trace-tour');
    if (old) old.remove();

    tourStep++;
    if (tourStep >= tourSteps.length) {
      tourActive = false;
      localStorage.setItem('trace_tour_done', '1');
      window.showToast('Tour complete! Explore freely. Press H S C I P to navigate.', 'success');
      return;
    }

    var step = tourSteps[tourStep];
    var target = document.querySelector(step.selector);
    if (!target) {
      // Skip if element not found
      window._tourNext();
      return;
    }

    var rect = target.getBoundingClientRect();
    var popup = document.createElement('div');
    popup.id = 'trace-tour';
    popup.className = 'tour-popup tour-' + (step.placement || 'bottom');
    popup.appendChild(buildTourArrow());
    var header = document.createElement('div');
    header.className = 'tour-header';
    var stepSpan = document.createElement('span');
    stepSpan.className = 'tour-step';
    stepSpan.textContent = (tourStep + 1) + '/' + tourSteps.length;
    header.appendChild(stepSpan);
    var titleStrong = document.createElement('strong');
    titleStrong.textContent = step.title;
    header.appendChild(titleStrong);
    popup.appendChild(header);
    var body = document.createElement('div');
    body.className = 'tour-body';
    body.textContent = step.text;
    popup.appendChild(body);
    var footer = document.createElement('div');
    footer.className = 'tour-footer';
    var skipBtn = document.createElement('button');
    skipBtn.className = 'tour-btn tour-btn-skip';
    skipBtn.id = 'tour-skip-btn';
    skipBtn.textContent = 'Skip';
    footer.appendChild(skipBtn);
    var nextBtn = document.createElement('button');
    nextBtn.className = 'tour-btn tour-btn-next';
    nextBtn.id = 'tour-next-btn';
    nextBtn.textContent = tourStep < tourSteps.length - 1 ? 'Next' : 'Done';
    footer.appendChild(nextBtn);
    popup.appendChild(footer);

    document.body.appendChild(popup);

    // Position the popup relative to target
    var popupRect = popup.getBoundingClientRect();
    var top, left;
    if (step.placement === 'bottom') {
      top = rect.bottom + 10;
      left = rect.left + rect.width / 2 - popupRect.width / 2;
    } else {
      top = rect.top - popupRect.height - 10;
      left = rect.left + rect.width / 2 - popupRect.width / 2;
    }
    // Keep in viewport
    left = Math.max(10, Math.min(left, window.innerWidth - popupRect.width - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - popupRect.height - 10));
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';

    // Highlight target
    target.classList.add('tour-highlight');

    // Bind buttons
    document.getElementById('tour-next-btn').addEventListener('click', function() {
      target.classList.remove('tour-highlight');
      window._tourNext();
    });
    document.getElementById('tour-skip-btn').addEventListener('click', function() {
      target.classList.remove('tour-highlight');
      var o = document.getElementById('trace-tour');
      if (o) o.remove();
      tourActive = false;
      localStorage.setItem('trace_tour_done', '1');
      window.showToast('Tour skipped. Start it anytime with "Start Tour".', 'info');
    });
  };

  // Auto-start tour on first visit
  if (!localStorage.getItem('trace_tour_done')) {
    // Wait for app to fully render (auth passed, intro complete, home visible)
    var checkReady = function() {
      var activeScreen = document.querySelector('.screen.active');
      var ready = activeScreen && activeScreen.id !== 's-intro' && activeScreen.id !== 's-auth';
      if (ready && typeof window.startTour === 'function') {
        window.startTour();
      } else {
        setTimeout(checkReady, 600);
      }
    };
    setTimeout(checkReady, 2500);
  }

  // ── 5. Mobile Responsiveness — Swipe to navigate ──
  var touchStartX = 0;
  var touchStartY = 0;
  var touchHandled = false;

  document.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchHandled = false;
    }
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (touchHandled || e.touches.length !== 1 || inScrollable) return;
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    // Only horizontal edge swipes over 60px (like native back gesture)
    var isEdge = touchStartX < 40 || touchStartX > window.innerWidth - 40;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2 && isEdge) {
      touchHandled = true;
      if (dx > 0 && typeof window.nav === 'function') {
        window.nav('home');
      } else if (dx < 0 && typeof window.nav === 'function') {
        window.nav('scan');
      }
    }
  }, { passive: true });

  console.log('[TRACE UX] Toasts, loading, keyboard shortcuts, tour, swipe loaded');
})();
