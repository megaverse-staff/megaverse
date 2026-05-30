(function () {
      const PRISMA_DATABASE_URL = 'https://bxddesiretest.forumactif.com/h3-test-prismas';
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

      function seededRandom(seed) {
        let value = seed >>> 0;

        return function () {
          value += 0x6D2B79F5;
          let t = value;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      function getCardId(card) {
        const ignoredClasses = ['badge', 'nope', 'obtenu'];
        const customClasses = [...card.classList].filter(c => !ignoredClasses.includes(c));

        return card.dataset.id || customClasses[0] || card.title || 'unknown';
      }

      function buildDatabaseFromDocument(doc) {
        return Array.from(doc.querySelectorAll(DATABASE_SELECTOR)).map(card => ({
          id: getCardId(card),
          name: card.dataset.name || card.title || getCardId(card) || 'Carte inconnue',
          image: card.getAttribute('src')
        })).filter(card => card.image);
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
        const random = seededRandom(hashString(seedText));
        const pool = [...cards];
        const result = [];

        while (result.length < count && pool.length > 0) {
          const index = Math.floor(random() * pool.length);
          result.push(pool.splice(index, 1)[0]);
        }

        return result;
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

        const warning = document.createElement('div');
        warning.className = 'prisma-roll-warning';
        warning.textContent = 'Tirage généré automatiquement. Toute édition de post peut modifier le résultat et est interdite. Si une édition est constatée par le staff, le tirage entier se verra annulé.';

        wrapper.appendChild(title);
        wrapper.appendChild(grid);
        wrapper.appendChild(list);
        wrapper.appendChild(warning);

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

        post.innerHTML = html.replace(safeMarker, container.innerHTML).replace(marker.fullMatch, container.innerHTML);
      }

      function initPrismacardsRolls(database) {
        if (!database.length) return;

        document.querySelectorAll(POST_SELECTOR).forEach((post, postIndex) => {
          const text = post.textContent;
          const markers = parseRollMarkers(text);
          if (!markers.length) return;

          markers.forEach((marker, markerIndex) => {
            const seedText = `${location.pathname}|post:${postIndex}|marker:${markerIndex}|${text}|${marker.fullMatch}`;
            const drawnCards = drawCards(database, marker.count, seedText);
            const rollElement = renderRoll(drawnCards, marker);

            replaceMarkerInPost(post, marker, rollElement);
          });
        });
      }

      document.addEventListener('DOMContentLoaded', () => {
        loadDatabase().then(initPrismacardsRolls).catch(error => {
          console.error('Erreur Prismacards : impossible de charger la base de données.', error);
        });
      });
    })();
