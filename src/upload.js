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
    zone.innerHTML = '<div class="upload-empty">' +
      '<div class="upload-icon-box">' +
      '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
      '</div>' +
      '<div class="upload-heading">Drop artwork here</div>' +
      '<div class="upload-sub">Images · PDFs (up to ' + BATCH_MAX + ' files)</div>' +
      '<div class="upload-hint">Batch upload · drag multiple files at once</div>' +
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

  // ── Resize an image to max 2048px on the longest side before upload ──
  // Uses off-screen canvas for memory-efficient resize
  function resizeImage(dataUrl, maxDim) {
    maxDim = maxDim || 2048;
    return new Promise(function(resolve) {
      var img = new Image();
      img.onload = function() {
        var w = img.width, h = img.height;
        if (w <= maxDim && h <= maxDim) {
          resolve(dataUrl); // Already small enough
          return;
        }
        var ratio = Math.min(maxDim / w, maxDim / h);
        var nw = Math.round(w * ratio);
        var nh = Math.round(h * ratio);
        var canvas = document.createElement('canvas');
        canvas.width = nw;
        canvas.height = nh;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, nw, nh);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function() { resolve(dataUrl); }; // Pass through on error
      img.src = dataUrl;
    });
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

      function handleDataUrl(dataUrl) {
        resizeImage(dataUrl).then(function(resized) {
          var img64 = resized.split(',')[1];
          var imgType = 'image/jpeg';

          // Create a synthetic File to trigger the existing scan pipeline
          var binaryStr = atob(img64);
          var len = binaryStr.length;
          var bytes = new Uint8Array(len);
          for (var bi = 0; bi < len; bi++) {
            bytes[bi] = binaryStr.charCodeAt(bi);
          }
          var resizedBlob = new Blob([bytes], { type: imgType });
          var file = new File([resizedBlob], item.label || 'upload.jpg', { type: imgType });
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
        });
      }

      if (item.blob) {
        var reader = new FileReader();
        reader.onload = function(ev) {
          handleDataUrl(ev.target.result);
        };
        reader.readAsDataURL(item.blob);
      } else if (item.dataUrl) {
        handleDataUrl(item.dataUrl);
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
      '<span class="text-gold-label">Batch Queue (' + batchQueue.length + ')</span>' +
      '<button data-upload-action="start" class="btn-batch-process">Process All</button>' +
      '</div>';
    batchQueue.forEach(function(item, i) {
      var div = document.createElement('div');
      div.style.cssText = 'padding:8px 14px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-dim);display:flex;justify-content:space-between;';
      div.innerHTML = '<span>' + window.esc(item.label || item.fileName || 'File ' + (i + 1)) + '</span>' +
        '<button data-upload-action="remove" data-upload-idx="' + i + '" class="btn-remove-item">✕</button>';
      existing.appendChild(div);
    });

    // Wire delegation listener once
    if (!existing._batchQueueBound) {
      existing._batchQueueBound = true;
      existing.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-upload-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-upload-action');
        if (action === 'start' && typeof window.TRACE_UPLOAD.startBatch === 'function') {
          window.TRACE_UPLOAD.startBatch();
        } else if (action === 'remove') {
          var idx = parseInt(btn.getAttribute('data-upload-idx'), 10);
          if (!isNaN(idx) && typeof window.TRACE_UPLOAD.removeFromQueue === 'function') {
            window.TRACE_UPLOAD.removeFromQueue(idx);
          }
        }
      });
    }
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
        batchBtn.addEventListener('click', function() {
          var inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'image/*,.pdf';
          inp.multiple = true;
          inp.onchange = function(e) {
            if (e.target.files) handleDrop(e.target.files);
          });
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
