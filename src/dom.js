// ══════════════════════════════════════════════
// TRACE — DomBuilder
// Clean DOM construction without string concatenation.
// Replaces `el.innerHTML = '<div ...>' + esc(x) + '</div>'`
// patterns with a fluent builder API that:
//   - Auto-escapes text content
//   - Accepts CSS class arrays or space-separated strings
//   - Supports style as string OR object
//   - Handles event listeners via on()
//   - Supports nesting via append()
// ══════════════════════════════════════════════

/**
 * Create a new DOM element with a fluent builder.
 *
 * Basic usage:
 *   dom('div', 'card', 'Hello')          → <div class="card">Hello</div>
 *   dom('div', ['card', 'active'])        → <div class="card active"></div>
 *   dom('span', 'title', 'Text')          → <span class="title">Text</span>
 *   dom('button', 'btn').on('click', fn)  → <button class="btn"></button>
 *   dom('div').append(child1, child2)     → nested children
 *
 * Advanced:
 *   dom('div', { class: 'card', style: 'color:var(--text);' }).text('Hello')
 *   dom('input', { type: 'text', placeholder: 'Name' })
 *
 * @param {string} tag - HTML tag name
 * @param {string|string[]|Object} [classesOrAttrs] - class name(s) or attribute object
 * @param {string} [textContent] - text content (auto-escaped)
 * @returns {DomBuilder}
 */
function dom(tag, classesOrAttrs, textContent) {
  return new DomBuilder(tag, classesOrAttrs, textContent);
}

class DomBuilder {
  /**
   * @param {string} tag - HTML tag name
   * @param {string|string[]|Object} [classesOrAttrs] - class name(s) or attribute object
   * @param {string} [textContent] - text content (auto-escaped)
   */
  constructor(tag, classesOrAttrs, textContent) {
    this.el = document.createElement(tag);

    if (classesOrAttrs != null) {
      if (typeof classesOrAttrs === 'string') {
        // Single class name
        this.el.className = classesOrAttrs;
      } else if (Array.isArray(classesOrAttrs)) {
        // Array of class names
        this.el.className = classesOrAttrs.filter(Boolean).join(' ');
      } else if (typeof classesOrAttrs === 'object') {
        // Attribute object
        this._setAttrs(classesOrAttrs);
      }
    }

    if (textContent != null) {
      this.el.textContent = textContent;
    }
  }

  /**
   * Set multiple attributes from an object.
   * Recognizes special keys: className, class, style (string or object),
   * onclick, onmouseenter, etc. (as event listeners), and dataset as object.
   * @param {Object} attrs
   * @returns {DomBuilder}
   */
  _setAttrs(attrs) {
    for (var key in attrs) {
      if (!attrs.hasOwnProperty(key)) continue;
      var val = attrs[key];
      if (val == null) continue;

      switch (key) {
        case 'className':
          this.el.className = val;
          break;
        case 'class':
          if (Array.isArray(val)) {
            this.el.className = val.filter(Boolean).join(' ');
          } else {
            this.el.className = val;
          }
          break;
        case 'style':
          if (typeof val === 'object') {
            for (var prop in val) {
              if (val.hasOwnProperty(prop)) {
                this.el.style[prop] = val[prop];
              }
            }
          } else {
            this.el.setAttribute('style', val);
          }
          break;
        case 'dataset':
          for (var dk in val) {
            if (val.hasOwnProperty(dk)) {
              this.el.dataset[dk] = val[dk];
            }
          }
          break;
        case 'textContent':
          this.el.textContent = val;
          break;
        case 'innerHTML':
          this.el.innerHTML = val;
          break;
        default:
          // Event listeners (onclick, onmouseenter, etc.)
          if (key.indexOf('on') === 0 && typeof val === 'function') {
            var eventType = key.slice(2);
            this.el.addEventListener(eventType, val);
          } else if (typeof val === 'boolean') {
            // Boolean attributes (disabled, checked, etc.)
            if (val) this.el.setAttribute(key, '');
          } else {
            this.el.setAttribute(key, String(val));
          }
      }
    }
    return this;
  }

  /**
   * Set an attribute on the element.
   * @param {string} name
   * @param {string|number|boolean} value
   * @returns {DomBuilder}
   */
  attr(name, value) {
    if (value == null) {
      this.el.removeAttribute(name);
    } else if (typeof value === 'boolean') {
      if (value) this.el.setAttribute(name, '');
      else this.el.removeAttribute(name);
    } else {
      this.el.setAttribute(name, String(value));
    }
    return this;
  }

  /**
   * Add one or more class names.
   * @param {...string} names
   * @returns {DomBuilder}
   */
  addClass() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) this.el.classList.add(arguments[i]);
    }
    return this;
  }

  /**
   * Remove one or more class names.
   * @param {...string} names
   * @returns {DomBuilder}
   */
  removeClass() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) this.el.classList.remove(arguments[i]);
    }
    return this;
  }

  /**
   * Toggle a class name.
   * @param {string} name
   * @param {boolean} [force]
   * @returns {DomBuilder}
   */
  toggleClass(name, force) {
    this.el.classList.toggle(name, force);
    return this;
  }

  /**
   * Set the text content (auto-escaped).
   * @param {string} text
   * @returns {DomBuilder}
   */
  text(text) {
    this.el.textContent = text;
    return this;
  }

  /**
   * Set innerHTML (use only with trusted/escaped content).
   * @param {string} html
   * @returns {DomBuilder}
   */
  html(html) {
    this.el.innerHTML = html;
    return this;
  }

  /**
   * Set inline style as a string or object.
   * @param {string|Object} styleValue
   * @returns {DomBuilder}
   */
  style(styleValue) {
    if (typeof styleValue === 'object') {
      for (var prop in styleValue) {
        if (styleValue.hasOwnProperty(prop)) {
          this.el.style[prop] = styleValue[prop];
        }
      }
    } else {
      this.el.setAttribute('style', styleValue);
    }
    return this;
  }

  /**
   * Add an event listener.
   * @param {string} eventType - Event type without 'on' prefix (e.g. 'click')
   * @param {function(Event)} handler
   * @param {Object|boolean} [options] - addEventListener options
   * @returns {DomBuilder}
   */
  on(eventType, handler, options) {
    this.el.addEventListener(eventType, handler, options);
    return this;
  }

  /**
   * Append one or more child elements to this element.
   * Accepts HTMLElements, DomBuilder instances, or strings (auto-escaped text).
   * @param {...(HTMLElement|DomBuilder|string)} children
   * @returns {DomBuilder}
   */
  append() {
    for (var i = 0; i < arguments.length; i++) {
      var child = arguments[i];
      if (child instanceof DomBuilder) {
        this.el.appendChild(child.el);
      } else if (typeof child === 'string') {
        this.el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        this.el.appendChild(child);
      }
    }
    return this;
  }

  /**
   * Append this element to a parent.
   * @param {HTMLElement|DomBuilder|string} parent - Parent element, DomBuilder, or selector
   * @returns {DomBuilder}
   */
  appendTo(parent) {
    if (parent instanceof DomBuilder) {
      parent.el.appendChild(this.el);
    } else if (typeof parent === 'string') {
      var p = document.querySelector(parent);
      if (p) p.appendChild(this.el);
    } else if (parent instanceof Node) {
      parent.appendChild(this.el);
    }
    return this;
  }

  /**
   * Prepend this element to a parent (insert as first child).
   * @param {HTMLElement|DomBuilder|string} parent
   * @returns {DomBuilder}
   */
  prependTo(parent) {
    if (parent instanceof DomBuilder) {
      parent.el.insertBefore(this.el, parent.el.firstChild);
    } else if (typeof parent === 'string') {
      var p = document.querySelector(parent);
      if (p) p.insertBefore(this.el, p.firstChild);
    } else if (parent instanceof Node) {
      parent.insertBefore(this.el, parent.firstChild);
    }
    return this;
  }

  /**
   * Query a child element within this element.
   * @param {string} sel - CSS selector
   * @returns {HTMLElement|null}
   */
  query(sel) {
    return this.el.querySelector(sel);
  }

  /**
   * Query all child elements within this element.
   * @param {string} sel - CSS selector
   * @returns {HTMLElement[]}
   */
  queryAll(sel) {
    return Array.prototype.slice.call(this.el.querySelectorAll(sel));
  }

  /**
   * Set the ID attribute.
   * @param {string} id
   * @returns {DomBuilder}
   */
  id(id) {
    this.el.id = id;
    return this;
  }

  /**
   * Show the element by removing display:none.
   * @returns {DomBuilder}
   */
  show() {
    this.el.style.display = '';
    return this;
  }

  /**
   * Hide the element by setting display:none.
   * @returns {DomBuilder}
   */
  hide() {
    this.el.style.display = 'none';
    return this;
  }

  /**
   * Get the underlying HTMLElement.
   * @returns {HTMLElement}
   */
  get() {
    return this.el;
  }

  /**
   * Remove the element from the DOM.
   * @returns {DomBuilder}
   */
  remove() {
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    return this;
  }
}

// ── Expose globally (matching project pattern) ──
window.DomBuilder = DomBuilder;
window.dom = dom;

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('domBuilder', {
    version: '1.0.0'
  });
}

console.log('[TRACE DomBuilder] Loaded');
