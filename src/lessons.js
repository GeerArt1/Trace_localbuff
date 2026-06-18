// ══════════════════════════════════════════════
// TRACE — Lessons Module
// Real lesson content with modal display
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var LESSONS = [
    {
      id: 1,
      num: 'Lesson 01',
      title: 'How to Read a Painting',
      summary: 'Composition, light, symbolism — what artists chose deliberately and why.',
      sections: [
        {
          heading: 'Reading the Visual Language',
          body: 'Every painting is a deliberate arrangement of elements. Artists make hundreds of conscious choices — what to include, where to place it, how to light it, and what symbols to weave in. Learning to read these choices transforms how you see art.'
        },
        {
          heading: 'Composition: The Hidden Grid',
          body: 'Master painters from the Renaissance onward used geometric frameworks to structure their compositions. The golden ratio (φ ≈ 1.618), rule of thirds, and dynamic symmetry rectangles (√2, √3, √4, √5) create visual harmony that feels \"right\" to the human eye. TRACE can overlay these grids on any artwork in the Sacred Geometry screen.'
        },
        {
          heading: 'Light as Storyteller',
          body: 'Caravaggio pioneered tenebrism — extreme contrast between light and dark — to heighten drama and direct the viewer\'s attention to key narrative elements. The direction, quality, and color of light in a painting reveal time of day, emotional tone, and sometimes the artist\'s philosophical stance.'
        },
        {
          heading: 'Symbolism: The Hidden Language',
          body: 'Vanitas paintings are filled with symbols of mortality: skulls (death), wilting flowers (decay), hourglasses (time running out), and bubbles (brevity of life). A lily meant purity, a dog meant fidelity, a mirror meant vanity. Learning this visual vocabulary unlocks layers of meaning invisible to the modern eye.'
        },
        {
          heading: 'Practical Exercise',
          body: 'Next time you view a painting in a museum (or on TRACE), ask: 1) Where does my eye go first? 2) What geometric structure holds the composition? 3) What objects might be symbols? 4) Where is the light coming from and why? 5) What story is being told in the details?'
        }
      ]
    },
    {
      id: 2,
      num: 'Lesson 02',
      title: 'Periods of Art History',
      summary: '5,000 years of human creativity from Egypt to Contemporary Art.',
      sections: [
        {
          heading: 'Ancient Art (3000 BCE — 400 CE)',
          body: 'From Egyptian tomb paintings to Greek sculpture to Roman mosaics, ancient art served religious, political, and commemorative functions. The Greeks perfected naturalistic proportions in sculpture. The Romans excelled at realistic portraiture and architectural engineering. Egyptian art remained remarkably consistent for 3,000 years — a visual language of eternal stability.'
        },
        {
          heading: 'Medieval & Gothic (400 — 1400)',
          body: 'After the fall of Rome, art shifted toward religious symbolism over naturalism. Byzantine art featured gold backgrounds and flattened figures. Gothic cathedrals used pointed arches, ribbed vaults, and flying buttresses to create soaring interior spaces flooded with colored light through stained glass windows — a technological and spiritual achievement.'
        },
        {
          heading: 'Renaissance (1400 — 1600)',
          body: 'The rediscovery of classical learning transformed art. Linear perspective was codified by Brunelleschi and Alberti. Leonardo da Vinci mastered sfumato (smoky transitions). Michelangelo pushed anatomy to its expressive limits in the Sistine Chapel. The printing press (c. 1440) revolutionized the spread of visual ideas through engravings and woodcuts.'
        },
        {
          heading: 'Baroque to Modern (1600 — 1900)',
          body: 'Baroque art amplified emotion through dramatic lighting, diagonal compositions, and theatrical intensity. The 19th century brought radical change: photography (1839) freed painting from documentation, leading to Impressionism (capturing light and atmosphere), then Post-Impressionism (emotional color), and eventually the ruptures of Cubism and Abstraction.'
        },
        {
          heading: 'Modern & Contemporary (1900 — Present)',
          body: 'The 20th century shattered artistic conventions: Dada rejected meaning itself, Surrealism explored the unconscious, Abstract Expressionism made gesture into subject, Pop Art merged high and low culture. Today\'s artists work across photography, video, performance, installation, AI-generated art, and digital mediums — every boundary has been tested.'
        }
      ]
    },
    {
      id: 3,
      num: 'Lesson 03',
      title: 'What is Provenance?',
      summary: 'Why ownership history matters, how stolen art gets recovered.',
      sections: [
        {
          heading: 'Provenance Defined',
          body: 'Provenance (from the French provenir, \"to come from\") is the documented history of an artwork\'s ownership, custody, and location from creation to the present day. It is the artwork\'s biography — who owned it, where it was exhibited, when it changed hands, and through which dealers, galleries, auctions, and museums it passed.'
        },
        {
          heading: 'Why Provenance Matters',
          body: 'A well-documented provenance can multiply an artwork\'s value tenfold. It authenticates the work (traceable to the artist\'s studio), establishes legal title (critical for sale and inheritance), reveals historical significance (exhibition history), and most importantly, ensures the work was not looted, stolen, or illegally exported. Banks, insurers, and serious collectors demand it.'
        },
        {
          heading: 'The Nazi Era: A Provenance Crisis',
          body: 'The Third Reich\'s systematic looting of Jewish collections (1933-1945) created a provenance catastrophe that the art world still grapples with today. An estimated 600,000 artworks were stolen, displaced, or forcibly sold. The 1998 Washington Conference Principles on Nazi-Confiscated Art established ethical guidelines for resolving these claims. TRACE\'s AAMD check scans specifically for gaps during this period.'
        },
        {
          heading: 'Provenance Research Tools',
          body: 'Researchers use: Getty ULAN (artist identification), Getty Provenance Index (auction records back to 1600s), INTERPOL Stolen Works Database (57,000+ stolen artworks), Art Loss Register (private database), AAMD Nazi-Era Project (museum collections), and UNESCO 1970 Convention (cultural property export controls). TRACE cross-references all six simultaneously.'
        },
        {
          heading: 'Red Flags in Provenance',
          body: 'Watch for: gaps during 1933-1945 (potential Nazi looting), gaps during periods of political upheaval, anonymous sellers, recently surfaced works without documentation, inconsistent attributions, and ownership chains that skip generations or cross borders during conflict periods. A clean provenance is continuous, verifiable, and transparent.'
        }
      ]
    },
    {
      id: 4,
      num: 'Lesson 04',
      title: 'Famous Art Forgeries',
      summary: 'Van Meegeren fooled the Nazis. How AI catches what humans miss.',
      sections: [
        {
          heading: 'The Forger Who Fooled the Nazis',
          body: 'Han van Meegeren (1889-1947) pulled off the most audacious forgery of the 20th century. Humiliated by art critics who dismissed his own work, he painted \"new\" Vermeers so convincing that Hermann Göring himself traded 137 stolen paintings for a van Meegeren-forged \"Vermeer\" in 1943. Van Meegeren was arrested for collaborating with the Nazis — and had to prove he was a forger, not a traitor, by painting a new Vermeer under police supervision.'
        },
        {
          heading: 'The Science of Detection',
          body: 'Modern forgery detection uses: X-ray imaging (reveals underlying layers and modern pigments), UV fluorescence (shows restoration and overpainting), infrared reflectography (detects underdrawing style), pigment analysis (many historic pigments cannot be chemically reproduced today), dendrochronology (tree-ring dating of wood panels), and radiocarbon dating (verifies material age). TRACE\'s multi-spectral module can help with several of these techniques.'
        },
        {
          heading: 'Famous Forgeries Throughout History',
          body: 'The \"Michelangelo\" Cupid (sculpted by the master as a youthful prank, buried to age it, and sold as an antique), the Etruscan Terracotta Warriors (six fake ancient statues that fooled the Metropolitan Museum of Art in the 1920s), the Wolfgang Beltracchi scandal (painted \"unknown\" works by Expressionist masters, fooling experts for decades), and the Knoedler Gallery case (40+ fake Abstract Expressionist works sold for $80M).'
        },
        {
          heading: 'How AI Detects Forgeries',
          body: 'TRACE and systems like it analyze: brushstroke patterns (every artist has a unique \"handwriting\" in their stroke), canvas weave density (period-consistent textiles), craquelure patterns (age cracks have predictable geometries), and pigment spectral signatures. Machine learning models can detect anomalies invisible to the human eye — differences in brush pressure, paint viscosity, and compositional tendency.'
        },
        {
          heading: 'The Ethical Dimension',
          body: 'Not all forgeries are criminal. Some are historical curiosities (students copying masters), some are political statements (Banksy\'s self-shredding prank), and some raise questions about authenticity in the age of AI-generated art. The line between inspiration, imitation, and forgery has blurred. What remains constant: the importance of provenance documentation in establishing truth.'
        }
      ]
    },
    {
      id: 5,
      num: 'Lesson 05',
      title: 'Hidden Symbols in Art',
      summary: 'The skull, the lily, the hourglass — every Old Master object had meaning.',
      sections: [
        {
          heading: 'The Language of Symbols',
          body: 'Before mass literacy, visual symbols were the primary way artists communicated complex ideas. A 17th-century viewer could \"read\" a still life the way we read a newspaper — every object was a word, every arrangement a sentence. Modern viewers often miss this layer entirely, seeing only decorative arrangements where contemporaries saw profound philosophical statements.'
        },
        {
          heading: 'Vanitas: Memento Mori',
          body: 'Vanitas still life paintings are visual sermons on the transience of life. A skull says \"you will die.\" A guttering candle says \"life is brief.\" A wilting flower says \"beauty fades.\" A soap bubble says \"life is fragile.\" A pocket watch says \"time is running out.\" An overturned glass says \"death is final.\" These paintings were not morbid — they were urgent moral reminders in an age of plague and high infant mortality.'
        },
        {
          heading: 'Flowers and Their Meanings',
          body: 'The language of flowers (floriography) was elaborate. The red rose meant passionate love (and martyrdom). The white lily meant purity (and the Virgin Mary). Sunflowers meant devotion. Tulips meant nobility (and in 1630s Holland, reckless speculation). Ivy meant fidelity and eternal life. Grapes meant the Eucharist and salvation. Dandelions meant sorrow. Every bloom in a Dutch flower painting was a coded message.'
        },
        {
          heading: 'Animals as Allegory',
          body: 'Animals carried heavy symbolic weight. The dog: fidelity (and in marriage portraits, wifely faithfulness). The cat: independence, but also witchcraft and domestic discord. The monkey: vice, folly, and imitation (apes were considered failed humans). The parrot: eloquence and exotic luxury. The owl: wisdom, but also blindness to truth. The butterfly: resurrection and the soul. A caged bird: virginity (or lost innocence).'
        },
        {
          heading: 'Colors as Code',
          body: 'Ultramarine (lapis lazuli) was more expensive than gold — only the wealthiest patrons could afford it, so its presence signaled both wealth and devotion. Red (vermilion) symbolized Christ\'s blood, papal authority, and passionate love. Green signaled hope, fertility, and earthly love (but also poison). Black was death, mourning, and solemnity — but also sophistication in elite portraits. Gold leaf was literal divine light, reserved for halos and heavenly scenes.'
        }
      ]
    }
  ];

  // ── Open a lesson in a modal overlay ──
  function openLesson(id) {
    var lesson = LESSONS.find(function(l) { return l.id === id; });
    if (!lesson) return;

    // Remove any existing lesson modal
    var existing = document.getElementById('trace-lesson-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'trace-lesson-modal';
    overlay.className = 'modal-overlay';

    var box = document.createElement('div');
    box.className = 'modal-box';

    // Header
    var head = document.createElement('div');
    head.className = 'modal-head';
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;';
    head.innerHTML = '<div><div class="lesson-num-label">' + lesson.num + '</div>' +
      '<div class="modal-title">' + lesson.title + '</div></div>' +
      '<button class="modal-close-btn" data-close-lesson>✕</button>';

    // Body
    var body = document.createElement('div');
    body.className = 'modal-body';
    var html = '';
    lesson.sections.forEach(function(s) {
      html += '<div class="lesson-section">' +
        '<div class="lesson-section-heading">' + s.heading + '</div>' +
        '<div class="lesson-section-body">' + s.body + '</div>' +
        '</div>';
    });
    body.innerHTML = html;

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', function() { overlay.remove(); });

    box.appendChild(head);
    box.appendChild(body);
    box.appendChild(closeBtn);
    overlay.appendChild(box);

    // Close on overlay click (background) or ✕ button
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay || e.target.hasAttribute('data-close-lesson')) {
        overlay.remove();
      }
    });

    document.body.appendChild(overlay);
  }

  // ── Bind lesson card click handlers via event delegation ──
  function bindLessonHandlers() {
    var learnScroll = document.querySelector('#s-learn .scroll');
    if (!learnScroll) return;
    learnScroll.addEventListener('click', function(e) {
      var card = e.target.closest('.learn-card');
      if (!card) return;
      var lessonId = parseInt(card.getAttribute('data-lesson-id'), 10);
      if (lessonId) openLesson(lessonId);
    });
  }

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('lessons', {
      version: '1.0.0',
      init: bindLessonHandlers
    });
  }

  // Expose globally for direct access
  window.openLesson = openLesson;

  console.log('[TRACE Lessons] Loaded — ' + LESSONS.length + ' lessons');
})();
