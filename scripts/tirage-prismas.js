 (function () {
  const PRISMA_DATABASE_URL = 'https://megaverse.forumactif.com/h22-prismacards';
  const POST_SELECTOR = '.postbody, .content, .post-content, .post .entry-content, .message-content';
  const DATABASE_SELECTOR = '#prisma-database img, #badges-profil img.badge';

  function hashString(str) {
    let hash = 2166136261;

    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return hash >>> 0;
  }

  function getCardId(card) {
    const ignoredClasses = ['badge', 'nope', 'obtenu'];

    const validClasses = [...card.classList].filter(
      c => !ignoredClasses.includes(c)
    );

    const lastClass = validClasses.length
      ? validClasses[validClasses.length - 1]
      : null;

    return card.dataset.id || lastClass || card.title || 'unknown';
  }

  function buildDatabaseFromDocument(doc) {
    return Array.from(doc.querySelectorAll(DATABASE_SELECTOR))
      .map(card => ({
        id: getCardId(card),
        name: card.dataset.name || card.title || getCardId(card) || 'Carte inconnue',
        image: card.getAttribute('src')
      }))
      .filter(card => card.image);
  }

  function loadDatabase() {
    return fetch(PRISMA_DATABASE_URL)
      .then(response => response.text())
      .then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return buildDatabaseFromDocument(doc);
      });
  }

  function parseRollMarkers(text) {
    const regex = /\[prismacards=(\d+)\]/gi;
    const markers = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      markers.push({
        fullMatch: match[0],
        count: parseInt(match[1], 10),
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

  function renderRoll(cards, marker) {
    const wrapper = document.createElement('div');
    wrapper.className = 'prisma-roll';

    const title = document.createElement('div');
    title.className = 'prisma-roll-title';
    title.textContent = `Tirage Prismacards — ${marker.count} carte(s)`;

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
      const postId = postWrapper && postWrapper.id
        ? postWrapper.id
        : `post-${postIndex}`;

      markers.forEach((marker, markerIndex) => {
		  const seedText = 
				`${postId}|${marker.fullMatch}`;

        const drawnCards = drawCards(
          database,
          marker.count,
          seedText
        );

        const rollElement = renderRoll(drawnCards, marker);

        replaceMarkerInPost(post, marker, rollElement);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadDatabase()
      .then(initPrismacardsRolls)
      .catch(error => {
        console.error(
          'Erreur Prismacards : impossible de charger la base de données.',
          error
        );
      });
  });
})();
