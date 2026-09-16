/**
 * MGV — AVATARS LIGHT / DARK
 * ----------------------------------------
 * Récupère automatiquement l'avatar light + dark
 * depuis le profil public Forumactif.
 *
 * Le champ "avatar night mode" est :
 * profile_field_6_41
 *
 * Cache : 24 heures.
 */

(function () {

    'use strict';

    const CONFIG = {

        // ID du champ Forumactif "avatar night mode"
        darkField: '#profile_field_6_50_content',

        // Avatar principal sur le profil public
        profileAvatar: '#user_avatar img',

        // Durée du cache : 24h
        cacheDuration: 24 * 60 * 60 * 1000,

        // Préfixe utilisé dans localStorage
        cachePrefix: 'mgv-avatar-'
    };


    /* =========================================
       VARIABLES
       ========================================= */

    const html = document.documentElement;

    // Utilisateurs déjà en cours de récupération
    const pendingUsers = new Map();

    // Correspondances connues :
    // URL avatar light => données avatar
    const avatarRegistry = new Map();


    /* =========================================
       OUTILS
       ========================================= */

    /**
     * Normalise une URL d'image.
     */
    function normalizeUrl(url) {

        if (!url) return '';

        try {
            return new URL(url, location.origin).href;
        } catch (e) {
            return url;
        }

    }


    /**
     * Extrait un ID utilisateur depuis /u123
     */
    function getUserIdFromUrl(url) {

        if (!url) return null;

        try {

            const parsed = new URL(url, location.origin);
            const match = parsed.pathname.match(/^\/u(\d+)\/?$/);

            return match ? match[1] : null;

        } catch (e) {
            return null;
        }

    }


    /* =========================================
       CACHE
       ========================================= */

    function getCachedUser(userId) {

        try {

            const raw = localStorage.getItem(
                CONFIG.cachePrefix + userId
            );

            if (!raw) return null;

            const data = JSON.parse(raw);

            if (
                !data.timestamp ||
                Date.now() - data.timestamp > CONFIG.cacheDuration
            ) {

                localStorage.removeItem(
                    CONFIG.cachePrefix + userId
                );

                return null;
            }

            return data;

        } catch (e) {

            return null;

        }

    }


    function cacheUser(userId, data) {

        try {

            localStorage.setItem(
                CONFIG.cachePrefix + userId,
                JSON.stringify({
                    light: data.light || '',
                    dark: data.dark || '',
                    timestamp: Date.now()
                })
            );

        } catch (e) {
            // Si localStorage est indisponible,
            // le système continue simplement sans cache.
        }

    }


    /* =========================================
       REGISTRE DES AVATARS
       ========================================= */

    function registerAvatar(userId, data) {

        if (!data || !data.light) return;

        const light = normalizeUrl(data.light);
        const dark = normalizeUrl(data.dark);

        const avatarData = {
            userId: String(userId),
            light: light,
            dark: dark
        };

        avatarRegistry.set(light, avatarData);

        /*
         * On enregistre aussi l'URL dark.
         * Ça permet de reconnaître une image qui aurait
         * déjà été switchée.
         */
        if (dark) {
            avatarRegistry.set(dark, avatarData);
        }

        updateImages();

    }


    /* =========================================
       LECTURE D'UN PROFIL
       ========================================= */

    function parseProfile(documentProfile) {

        const avatar =
            documentProfile.querySelector(CONFIG.profileAvatar);

        const darkField =
            documentProfile.querySelector(CONFIG.darkField);

        if (!avatar) return null;

        const light = normalizeUrl(avatar.src);

        /*
         * Le champ Forumactif est un input sur ton profil.
         * On récupère donc sa value.
         */
        let dark = '';

        if (darkField) {

            dark =
                darkField.value ||
                darkField.getAttribute('value') ||
                '';

        }

        return {
            light: light,
            dark: normalizeUrl(dark)
        };

    }


    /* =========================================
       RÉCUPÉRATION D'UN UTILISATEUR
       ========================================= */

    async function loadUser(userId) {

        userId = String(userId);

        /*
         * Déjà en cours ?
         * On réutilise la même Promise.
         */
        if (pendingUsers.has(userId)) {
            return pendingUsers.get(userId);
        }


        /*
         * Cache disponible ?
         */
        const cached = getCachedUser(userId);

        if (cached) {

            registerAvatar(userId, cached);

            return cached;

        }


        /*
         * Sinon on charge /uX.
         */
        const promise = fetch('/u' + userId, {
            credentials: 'same-origin'
        })

            .then(response => {

                if (!response.ok) {
                    throw new Error(
                        'Profil /u' + userId + ' inaccessible'
                    );
                }

                return response.text();

            })

            .then(htmlString => {

                const parser = new DOMParser();

                const profileDocument =
                    parser.parseFromString(
                        htmlString,
                        'text/html'
                    );

                const data = parseProfile(profileDocument);

                if (!data) return null;

                cacheUser(userId, data);
                registerAvatar(userId, data);

                return data;

            })

            .catch(error => {

                console.warn(
                    '[MGV Avatars]',
                    error
                );

                return null;

            })

            .finally(() => {

                pendingUsers.delete(userId);

            });


        pendingUsers.set(userId, promise);

        return promise;

    }


    /* =========================================
       PROFIL ACTUEL
       ========================================= */

    function registerCurrentProfile() {

        const match =
            location.pathname.match(/^\/u(\d+)\/?$/);

        if (!match) return;

        const userId = match[1];

        /*
         * Ici les informations sont déjà présentes
         * dans le DOM : aucune requête nécessaire.
         */
        const data = parseProfile(document);

        if (!data) return;

        cacheUser(userId, data);
        registerAvatar(userId, data);

    }


    /* =========================================
       DÉCOUVERTE DES MEMBRES
       ========================================= */

    function discoverUsers(root = document) {

        const ids = new Set();


        /*
         * 1 — Tous les liens Forumactif /u123
         */
        root.querySelectorAll?.('a[href]').forEach(link => {

            const userId =
                getUserIdFromUrl(link.getAttribute('href'));

            if (userId) {
                ids.add(userId);
            }

        });


        /*
         * 2 — Switcheroo
         *
         * Exemple :
         * <li data-id="1"
         *     data-action="switcheroo">
         */
        root.querySelectorAll?.(
            '[data-action="switcheroo"][data-id]'
        ).forEach(element => {

            const userId = element.dataset.id;

            if (/^\d+$/.test(userId || '')) {
                ids.add(userId);
            }

        });


        /*
         * Charge chaque membre découvert.
         */
        ids.forEach(userId => {
            loadUser(userId);
        });

    }


    /* =========================================
       SWITCH DES IMAGES
       ========================================= */

    function updateImages(root = document) {

        const isDark =
            html.dataset.colorScheme === 'dark';

        root.querySelectorAll?.('img').forEach(img => {

            /*
             * On regarde :
             * - son src actuel
             * - son src original éventuellement mémorisé
             */
            const current =
                normalizeUrl(img.currentSrc || img.src);

            const original =
                normalizeUrl(img.dataset.mgvAvatarOriginal);


            let data =
                avatarRegistry.get(current) ||
                avatarRegistry.get(original);


            if (!data) return;


            /*
             * On marque l'image comme avatar MGV.
             */
            img.classList.add('mgv-switch-avatar');

            img.dataset.avatarLight = data.light;

            if (data.dark) {
                img.dataset.avatarDark = data.dark;
            }


            /*
             * Garde l'URL originale.
             */
            if (!img.dataset.mgvAvatarOriginal) {
                img.dataset.mgvAvatarOriginal = data.light;
            }


            /*
             * Dark renseigné :
             * dark mode => dark
             *
             * Sinon fallback sur light.
             */
            const wanted =
                isDark && data.dark
                    ? data.dark
                    : data.light;


            if (
                normalizeUrl(img.src) !== wanted
            ) {
                img.src = wanted;
            }

        });

    }


    /* =========================================
       MISE À JOUR GLOBALE
       ========================================= */

    function refresh(root = document) {

        discoverUsers(root);
        updateImages(root);

    }


    /* =========================================
       ÉLÉMENTS AJOUTÉS DYNAMIQUEMENT
       ========================================= */

    let observerTimer;

    const observer = new MutationObserver(mutations => {

        /*
         * Debounce :
         * si Switcheroo injecte 15 éléments d'un coup,
         * on ne relance pas le système 15 fois.
         */
        clearTimeout(observerTimer);

        observerTimer = setTimeout(() => {

            mutations.forEach(mutation => {

                mutation.addedNodes.forEach(node => {

                    if (
                        node.nodeType !== Node.ELEMENT_NODE
                    ) return;

                    refresh(node);

                });

            });

            /*
             * Certains scripts modifient uniquement
             * des src existants.
             */
            updateImages();

        }, 50);

    });


    /* =========================================
       CHANGEMENT DE THÈME
       ========================================= */

    /*
     * Le plugin du thème pourra déclencher
     * cet événement.
     */
    document.addEventListener(
        'mgv:themechange',
        function () {
            updateImages();
        }
    );


    /*
     * Fonction publique pratique pour debug
     * ou futurs scripts.
     */
    window.MGVAvatars = {

        refresh: refresh,

        update: updateImages,

        loadUser: loadUser,

        clearCache: function () {

            Object.keys(localStorage).forEach(key => {

                if (
                    key.startsWith(CONFIG.cachePrefix)
                ) {
                    localStorage.removeItem(key);
                }

            });

            avatarRegistry.clear();

            refresh();

        }

    };


    /* =========================================
       INITIALISATION
       ========================================= */

    function init() {

        /*
         * Si on est déjà sur /uX,
         * récupère directement ses informations.
         */
        registerCurrentProfile();

        /*
         * Recherche les membres présents.
         */
        refresh();

        /*
         * Observe les ajouts dynamiques.
         */
        if (document.body) {

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

        }

    }


    if (document.readyState === 'loading') {

        document.addEventListener(
            'DOMContentLoaded',
            init
        );

    } else {

        init();

    }

})();
