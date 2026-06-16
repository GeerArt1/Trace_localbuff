// ══════════════════════════════════════════════
// TRACE — Multi-Modal Upload v1.0
// Drag-and-drop · PDF image extraction · Batch queue
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var BATCH_MAX = 20;
  var batchQueue = [];
  var isProcessing = false;

  // ── Create drag-and-drop zone overlay ──
  function createDropZone() {
    var existing = document.getElementById('trace-drop-zone');
    if (existing) return;

    var zone = document.createElement('div');
    zone.id = 'trace-drop-zone';
    zone.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;align-items:center;justify-content:center;background:rgba(5,4,3,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
    zone.innerHTML = '<div style="text-align:center;padding:40px;">' +
      '<div style="width:80px;height:80px;margin:0 auto 20px;border:2px dashed var(--gold);border-radius:50%;display:flex;align-items:center;justify-content:center;">' +
      '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
      '</div>' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:24px;color:var(--text);margin-bottom:8px;">Drop artwork here</div>' +
      '<div style="font-size:11px;color:var(--text-dim);letter-spacing:.1em;">Images · PDFs (up to ' + BATCH_MAX + ' files)</div>' +
      '<div style="margin-top:16px;font-size:9px;color:var(--text-ghost);">Batch upload · drag multiple files at once</div>' +
      '</div>';
    document.body.appendChild(zone);
  }

  // ── Extract images from PDF file ──
  function extractImagesFromPDF(file) {
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var arrayBuffer = e.target.result;
        var uint8 = new Uint8Array(arrayBuffer);

        // Find JPEG streams embedded in PDF
        var images = [];
        var i = 0;

        // Look for JPEG (FF D8 FF)
        while (i < uint8.length - 3) {
          if (uint8[i] === 0xFF && uint8[i+1] === 0xD8 && uint8[i+2] === 0xFF) {
            var start = i;
            var end = start;
            // Find end of JPEG (FF D9)
            for (let j = start; j < uint8.length - 1; j++) {
              if (uint8[j] === 0xFF && uint8[j+1] === 0xD9) {
                end = j + 2;
                break;
              }
            }
            if (end > start) {
              var jpegData = uint8.slice(start, end);
              var blob = new Blob([jpegData], { type: 'image/jpeg' });
              var label = images.length === 0 ? 'PDF Page 1' : 'PDF Page ' + (images.length + 1);
              images.push({ blob: blob, label: label, type: 'image/jpeg' });
              i = end;
              continue;
            }
          }
          i++;
        }

        // If no JPEG found, try rendering first page as screenshot
        if (images.length === 0) {
          // For non-image PDFs, create a placeholder
          images.push({
            data: null,
            label: 'PDF: ' + file.name,
            type: 'application/pdf',
            isPDFRef: true,
            fileName: file.name
          });
        }

        resolve(images);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Add file to batch queue ──
  function addToQueue(item) {
    if (batchQueue.length >= BATCH_MAX) {
      window.toast('Batch limit reached (max ' + BATCH_MAX + ' files)');
      return false;
    }
    batchQueue.push(item);
    updateBatchUI();
    return true;
  }

  // ── Process a single file from the queue ──
  function processFile(item) {
    return new Promise(function(resolve) {
      if (item.type === 'application/pdf' && item.isPDFRef) {
        // PDF without extractable images — skip or mark
        window.toast('No images found in PDF: ' + (item.fileName || 'PDF'));
        resolve(null);
        return;
      }

      if (item.blob) {
        var reader = new FileReader();
        reader.onload = function(ev) {
          var dataUrl = ev.target.result;
          var img64 = dataUrl.split(',')[1];
          var imgType = item.blob.type || 'image/jpeg';

          // Create a synthetic File to trigger the existing scan pipeline
          var file = new File([item.blob], item.label || 'upload.jpg', { type: imgType });
          var dt = new DataTransfer();
          dt.items.add(file);
          var inp = document.getElementById('main-file');
          if (inp) {
            inp.files = dt.files;
            window.onFile({ target: inp });
          }

          // Expose to other screens
          window._scanImageData = { data: img64, type: imgType };

          resolve({ data: img64, type: imgType, label: item.label });
        };
        reader.readAsDataURL(item.blob);
      } else if (item.dataUrl) {
        var d = item.dataUrl;
        var idx = d.indexOf(',');
        img64 = idx >= 0 ? d.slice(idx + 1) : d;
        imgType = item.type || 'image/jpeg';

        var file = new File([item.blob || item.dataUrl], item.label || 'upload.jpg', { type: imgType });
        var dt = new DataTransfer();
        dt.items.add(file);
        var inp = document.getElementById('main-file');
        if (inp) {
          inp.files = dt.files;
          window.onFile({ target: inp });
        }
        window._scanImageData = { data: img64, type: imgType };
        resolve({ data: img64, type: imgType, label: item.label });
      } else {
        resolve(null);
      }
    });
  }

  // ── Process the batch queue sequentially ──
  function processBatch() {
    if (isProcessing || batchQueue.length === 0) return;
    isProcessing = true;

    var total = batchQueue.length;
    var processed = 0;

    function next() {
      if (batchQueue.length === 0) {
        isProcessing = false;
        updateBatchUI();
        window.toast('Batch complete — ' + processed + '/' + total + ' processed');
        return;
      }

      var item = batchQueue.shift();
      processFile(item).then(function(result) {
        if (result) processed++;

        // Show batch progress
        window.updateScanProgress(Math.round((processed / total) * 100));

        // Wait between items (avoid rate limiting)
        setTimeout(next, 800);
      }).catch(function() {
        setTimeout(next, 800);
      });
    }

    window.toast('Processing batch: ' + total + ' file' + (total > 1 ? 's' : ''));
    next();
  }

  // ── Update batch queue UI ──
  function updateBatchUI() {
    var existing = document.getElementById('batch-queue');
    if (!existing) return;
    if (batchQueue.length === 0) {
      existing.style.display = 'none';
      return;
    }
    existing.style.display = 'block';
    existing.innerHTML =
      '<div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">' +
      '<span style="font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);">Batch Queue (' + batchQueue.length + ')</span>' +
      '<button onclick="window.TRACE_UPLOAD.startBatch()" style="background:var(--gold);color:#060402;border:none;padding:6px 12px;font-size:8px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:2px;">Process All</button>' +
      '</div>';
    batchQueue.forEach(function(item, i) {
      var div = document.createElement('div');
      div.style.cssText = 'padding:8px 14px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-dim);display:flex;justify-content:space-between;';
      div.innerHTML = '<span>' + window.esc(item.label || item.fileName || 'File ' + (i + 1)) + '</span>' +
        '<button onclick="window.TRACE_UPLOAD.removeFromQueue(' + i + ')" style="background:none;border:none;color:var(--red-lt);cursor:pointer;font-size:12px;">✕</button>';
      existing.appendChild(div);
    });
  }

  // ── Handle file drop ──
  function handleDrop(files) {
    var added = 0;
    for (let i = 0; i < files.length && added < BATCH_MAX; i++) {
      var file = files[i];
      var type = file.type || '';

      if (type.startsWith('image/')) {
        var reader = new FileReader();
        reader.onload = (function(f) {
          return function(e) {
            var item = {
              blob: f,
              dataUrl: e.target.result,
              label: f.name,
              type: f.type,
              fileName: f.name
            };
            if (addToQueue(item)) {
              added++;
              // Auto-add single files to scan immediately
              if (files.length === 1) {
                processFile(item);
              }
            }
          };
        })(file);
        reader.readAsDataURL(file);
      } else if (type === 'application/pdf') {
        // Extract images from PDF
        (function(f) {
          extractImagesFromPDF(f).then(function(images) {
            images.forEach(function(img) {
              if (addToQueue(img)) added++;
            });
            if (images.length === 0) {
              window.toast('No extractable images in PDF: ' + f.name);
            } else if (files.length === 1 && images.length === 1) {
              processFile(images[0]);
            }
          });
        })(file);
      } else {
        window.toast('Unsupported file type: ' + (file.name || 'unknown'));
      }
    }
  }

  // ── Public API ──
  window.TRACE_UPLOAD = {
    init: function() {
      createDropZone();

      // Drag-and-drop events on document
      document.addEventListener('dragenter', function(e) {
        e.preventDefault();
        var zone = document.getElementById('trace-drop-zone');
        if (zone) zone.style.display = 'flex';
      });

      document.addEventListener('dragover', function(e) {
        e.preventDefault();
      });

      document.addEventListener('dragleave', function(e) {
        if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#trace-drop-zone')) return;
        var zone = document.getElementById('trace-drop-zone');
        if (zone) zone.style.display = 'none';
      });

      document.addEventListener('drop', function(e) {
        e.preventDefault();
        var zone = document.getElementById('trace-drop-zone');
        if (zone) zone.style.display = 'none';
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) {
          handleDrop(files);
        }
      });

      // Add batch upload button to scan screen
      var sourcePicker = document.getElementById('source-picker');
      if (sourcePicker) {
        var batchBtn = document.createElement('button');
        batchBtn.className = 'btn-up';
        batchBtn.style.cssText = 'flex:1;justify-content:center;';
        batchBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" style="display:inline;vertical-align:middle;margin-right:5px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Batch';
        batchBtn.onclick = function() {
          var inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'image/*,.pdf';
          inp.multiple = true;
          inp.onchange = function(e) {
            if (e.target.files) handleDrop(e.target.files);
          };
          inp.click();
        };
        sourcePicker.appendChild(batchBtn);
      }

      // Create batch queue UI panel
      var scroll = document.getElementById('scan-scroll');
      if (scroll) {
        var queuePanel = document.createElement('div');
        queuePanel.id = 'batch-queue';
        queuePanel.style.cssText = 'display:none;border-top:1px solid var(--border);background:var(--surface);';
        scroll.appendChild(queuePanel);
      }

    },

    addToQueue: addToQueue,
    processFile: processFile,
    processBatch: processBatch,
    startBatch: processBatch,
    removeFromQueue: function(idx) {
      if (idx >= 0 && idx < batchQueue.length) {
        batchQueue.splice(idx, 1);
        updateBatchUI();
      }
    },
    getQueueLength: function() { return batchQueue.length; },

    // Expose for scan integration
    extractImagesFromPDF: extractImagesFromPDF,
    handleDrop: handleDrop
  };

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('upload', {
      version: '1.0.0',
      dependsOn: ['utils', 'scan'],
      init: function() { window.TRACE_UPLOAD.init(); },
      commands: [
        { name: 'batch-process', label: 'Process Batch Queue', action: function() { window.TRACE_UPLOAD.startBatch(); } }
      ]
    });
  }

  console.log('[TRACE Upload] Multi-modal ready — drag-and-drop, PDF extraction, batch queue');
})();
