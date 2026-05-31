 (function () {
  const PRISMA_DATABASE_URL = 'https://megaverse.forumactif.com/h22-prismacards';
  const POST_SELECTOR = '.postbody, .content, .post-content, .post .entry-content, .message-content';
  const DATABASE_SELECTOR = '#prisma-database img, #badges-profil img.badge';
  const TEXTAREA_SELECTOR = 'textarea[name="message"], textarea#text_editor_textarea, textarea.sceditor_textarea, textarea';
  const SUBMIT_SELECTOR = 'input[type="submit"], button[type="submit"], input[name="post"], input[name="preview"]';

  let databasePromise = null;

  function hashString(str) {
    let hash = 2166136261;

    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return hash >>> 0;
  }

  function randomSeed() {
    if (window.crypto && crypto.getRandomValues) {
      const values = new Uint32Array(4);
      crypto.getRandomValues(values);
      return `${Date.now()}-${Array.from(values).join('-')}`;
    }

    return `${Date.now()}-${Math.random()}-${performance.now()}`;
  }

  function getCardId(card) {
    const ignoredClasses = ['badge', 'nope', 'obtenu'];
    const validClasses = [...card.classList].filter(c => !ignoredClasses.includes(c));
    const lastClass = validClasses.length ? validClasses[validClasses.length - 1] : null;

    return card.dataset.id || lastClass || card.title || 'unknown';
  }

  function buildDatabaseFromDocument(doc) {
    const seen = new Set();

    return Array.from(doc.querySelectorAll(DATABASE_SELECTOR))
      .map(card => {
        const id = getCardId(card);

        return {
          id,
          name: card.dataset.name || card.title || id || 'Carte inconnue',
          image: card.getAttribute('src')
        };
      })
      .filter(card => {
        if (!card.id || !card.image || seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      });
  }

  function loadDatabase() {
    if (!databasePromise) {
      databasePromise = fetch(PRISMA_DATABASE_URL)
        .then(response => response.text())
        .then(html => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          return buildDatabaseFromDocument(doc);
        });
    }

    return databasePromise;
  }

  function parseRollMarkers(text) {
    const regex = /\[prismacards(?:=(\d+)|\s+locked=["“]([^"”]+)["”])\]/gi;
    const markers = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      const lockedIds = match[2]
        ? match[2].split(';').map(id => id.trim()).filter(Boolean)
        : null;

      markers.push({
        fullMatch: match[0],
        count: match[1] ? parseInt(match[1], 10) : lockedIds.length,
        lockedIds,
        index: match.index
      });
    }

    return markers;
  }

  function drawCards(cards, count, seedText) {
    return cards
      .map(card => ({
        card,
        score: hashString(`${seedText}|${card.id}`)
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, count)
      .map(entry => entry.card);
  }

  function makeLockedCode(cards) {
    return `[prismacards locked="${cards.map(card => card.id).join('; ')}"]`;
  }

  function lockRawRollsInMessage(message, database) {
    return message.replace(/\[prismacards=(\d+)\]/gi, function (fullMatch, count) {
      const drawnCards = drawCards(database, parseInt(count, 10), randomSeed());
      return makeLockedCode(drawnCards);
    });
  }

  function getTextarea() {
    return document.querySelector(TEXTAREA_SELECTOR);
  }

  function getEditorInstance(textarea) {
    if (!textarea || !window.jQuery || !jQuery(textarea).sceditor) return null;

    try {
      return jQuery(textarea).sceditor('instance');
    } catch (error) {
      return null;
    }
  }

  function getEditorValue(textarea) {
    const editor = getEditorInstance(textarea);
    if (editor) return editor.val();

    return textarea ? textarea.value : '';
  }

  function setEditorValue(textarea, value) {
    const editor = getEditorInstance(textarea);

    if (editor) {
      editor.val(value);
      editor.updateOriginal();
    }

    if (textarea) {
      textarea.value = value;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function lockCurrentEditorRolls(database) {
    const textarea = getTextarea();
    if (!textarea) return false;

    const currentValue = getEditorValue(textarea);
    if (!/\[prismacards=\d+\]/i.test(currentValue)) return false;

    const lockedValue = lockRawRollsInMessage(currentValue, database);
    setEditorValue(textarea, lockedValue);

    return true;
  }

  function renderRoll(cards, marker) {
    const wrapper = document.createElement('div');
    wrapper.className = 'prisma-roll';

    const title = document.createElement('div');
    title.className = 'prisma-roll-title';
    title.textContent = `Tirage Prismacards — ${cards.length} carte(s)`;

    const grid = document.createElement('div');
    grid.className = 'prisma-roll-grid';

    cards.forEach(card => {
      const item = document.createElement('div');
      item.className = 'prisma-card-result';
      item.innerHTML = `<img src="${card.image}" alt="${card.name}" title="${card.name}">`;
      grid.appendChild(item);
    });

    const list = document.createElement('div');
    list.className = 'prisma-roll-list';
    list.textContent = cards.map(card => card.id).join('; ');

    wrapper.appendChild(title);
    wrapper.appendChild(grid);
    wrapper.appendChild(list);

    return wrapper;
  }

  function replaceMarkerInPost(post, marker, rollElement) {
    const html = post.innerHTML;
    const safeMarker = marker.fullMatch
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const container = document.createElement('div');
    container.appendChild(rollElement);

    post.innerHTML = html
      .replace(safeMarker, container.innerHTML)
      .replace(marker.fullMatch, container.innerHTML);
  }

  function initPrismacardsRolls(database) {
    if (!database.length) return;

    document.querySelectorAll(POST_SELECTOR).forEach((post, postIndex) => {
      const text = post.textContent;
      const markers = parseRollMarkers(text);

      if (!markers.length) return;

      const postWrapper = post.closest('[id^="p"], .post');
      const postId = postWrapper && postWrapper.id ? postWrapper.id : `post-${postIndex}`;

      markers.forEach((marker, markerIndex) => {
        const drawnCards = marker.lockedIds
          ? marker.lockedIds.map(id => database.find(card => card.id === id)).filter(Boolean)
          : drawCards(database, marker.count, `${postId}|${markerIndex}|${marker.fullMatch}`);

        const rollElement = renderRoll(drawnCards, marker);
        replaceMarkerInPost(post, marker, rollElement);
      });
    });
  }

  function bindSubmitLock(database) {
    document.addEventListener('mousedown', event => {
      if (!event.target.closest(SUBMIT_SELECTOR)) return;
      lockCurrentEditorRolls(database);
    }, true);

    document.addEventListener('click', event => {
      if (!event.target.closest(SUBMIT_SELECTOR)) return;
      lockCurrentEditorRolls(database);
    }, true);

    document.addEventListener('submit', event => {
      if (!event.target.closest('form')) return;
      lockCurrentEditorRolls(database);
    }, true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadDatabase()
      .then(database => {
        initPrismacardsRolls(database);
        bindSubmitLock(database);
      })
      .catch(error => {
        console.error('Erreur Prismacards : impossible de charger la base de données.', error);
      });
  });
})();
