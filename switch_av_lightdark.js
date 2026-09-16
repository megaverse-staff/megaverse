/**
 * MGV — AVATARS LIGHT / DARK
 * Forum officiel
 *
 * Avatar normal : avatar Forumactif
 * Avatar dark   : champ profil #field_id50
 *
 * Le script :
 * - découvre les membres présents sur la page
 * - récupère leur profil public si nécessaire
 * - associe automatiquement avatar normal / avatar dark
 * - remplace toutes les occurrences de ces images sur la page
 * - fonctionne avec les éléments ajoutés dynamiquement
 * - garde les données en cache 24h
 */

(function () {

    'use strict';

    const CONFIG = {

        // Champ "avatar night mode" sur le profil public
        darkField: '#field_id50',

        // Avatar principal sur le profil public
        profileAvatar: '#user_avatar img',

        // Cache pendant 24 heures
        cacheDuration: 24 * 60 * 60 * 1000,

        cachePrefix: 'mgv-avatar-'
    };


    const html = document.documentElement;

    const pendingUsers = new Map();

    /*
     * Contient les correspondances :
     *
     * URL light → données membre
     * URL dark  → mêmes données membre
     */
    const avatarRegistry = new Map();


    /* =========================================
       OUTILS
       ========================================= */

    function normalizeUrl(url) {

        if (!url) return '';

        try {
            return new URL(url, location.origin).href;
        } catch (e) {
            return url;
        }

    }


    function getUserIdFromUrl(url) {

        if (!url) return null;

        try {

            const parsed = new URL(url, location.origin);

            const match =
                parsed.pathname.match(/^\/u(\d+)\/?$/);

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
                Date.now() - data.timestamp >
                CONFIG.cacheDuration
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

            // Le système continue sans cache

        }

    }


    /* =========================================
       REGISTRE
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
         * Ainsi une image déjà switchée reste reconnue.
         */
        if (dark) {
            avatarRegistry.set(dark, avatarData);
        }

        updateImages();

    }


    /* =========================================
       LECTURE DU PROFIL PUBLIC
       ========================================= */

    function parseProfile(profileDocument) {

        /*
         * Avatar Forumactif normal
         */
        const avatar =
            profileDocument.querySelector(
                CONFIG.profileAvatar
            );

        if (!avatar) return null;


        const light = normalizeUrl(
            avatar.getAttribute('src') || avatar.src
        );


        /*
         * Champ "avatar night mode"
         *
         * Sur MGV officiel :
         *
         * #field_id50
         *     └── .field_uneditable
         *             └── img
         */
        const darkField =
            profileDocument.querySelector(
                CONFIG.darkField
            );

        let dark = '';

        if (darkField) {

            const darkImg =
                darkField.querySelector('img');

            if (darkImg) {

                dark = normalizeUrl(
                    darkImg.getAttribute('src') ||
                    darkImg.src
                );

            }

        }


        return {
            light: light,
            dark: dark
        };

    }


    /* =========================================
       CHARGEMENT D'UN MEMBRE
       ========================================= */

    async function loadUser(userId) {

        userId = String(userId);


        /*
         * Requête déjà en cours ?
         */
        if (pendingUsers.has(userId)) {

            return pendingUsers.get(userId);

        }


        /*
         * Déjà en cache ?
         */
        const cached =
            getCachedUser(userId);

        if (cached) {

            registerAvatar(
                userId,
                cached
            );

            return cached;

        }


        /*
         * Sinon récupération de /uX
         */
        const promise = fetch('/u' + userId, {
            credentials: 'same-origin'
        })

        .then(response => {

            if (!response.ok) {

                throw new Error(
                    'Profil /u' +
                    userId +
                    ' inaccessible'
                );

            }

            return response.text();

        })

        .then(htmlString => {

            const parser =
                new DOMParser();

            const profileDocument =
                parser.parseFromString(
                    htmlString,
                    'text/html'
                );

            const data =
                parseProfile(profileDocument);

            if (!data) return null;


            cacheUser(
                userId,
                data
            );

            registerAvatar(
                userId,
                data
            );


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


        pendingUsers.set(
            userId,
            promise
        );


        return promise;

    }


    /* =========================================
       PROFIL ACTUEL
       ========================================= */

    function registerCurrentProfile() {

        const match =
            location.pathname.match(
                /^\/u(\d+)\/?$/
            );

        if (!match) return;


        const userId = match[1];

        /*
         * Sur un profil, toutes les données sont
         * déjà présentes : aucun fetch nécessaire.
         */
        const data =
            parseProfile(document);

        if (!data) return;


        cacheUser(
            userId,
            data
        );

        registerAvatar(
            userId,
            data
        );

    }


    /* =========================================
       DÉCOUVERTE DES MEMBRES
       ========================================= */

    function discoverUsers(root = document) {

        const ids = new Set();


        /*
         * Liens classiques Forumactif :
         * /u1
         * /u74
         * etc.
         */
        root.querySelectorAll?.(
            'a[href]'
        ).forEach(link => {

            const userId =
                getUserIdFromUrl(
                    link.getAttribute('href')
                );

            if (userId) {
                ids.add(userId);
            }

        });


        /*
         * SWITCHEROO
         *
         * <li
         *   data-id="74"
         *   data-action="switcheroo"
         * >
         */
        root.querySelectorAll?.(
            '[data-action="switcheroo"][data-id]'
        ).forEach(element => {

            const userId =
                element.dataset.id;

            if (
                /^\d+$/.test(
                    userId || ''
                )
            ) {

                ids.add(userId);

            }

        });


        ids.forEach(userId => {

            loadUser(userId);

        });

    }


    /* =========================================
       SWITCH DE TOUTES LES IMAGES
       ========================================= */

    function updateImages(root = document) {

        const isDark =
            html.dataset.colorScheme === 'dark';


        /*
         * Oui : TOUTES les images.
         *
         * Mais seules celles dont l'URL correspond
         * à un avatar connu sont modifiées.
         */
        root.querySelectorAll?.(
            'img'
        ).forEach(img => {


            const current =
                normalizeUrl(
                    img.getAttribute('src') ||
                    img.src
                );


            const original =
                normalizeUrl(
                    img.dataset.mgvAvatarOriginal
                );


            const data =
                avatarRegistry.get(current) ||
                avatarRegistry.get(original);


            /*
             * Ce n'est pas un avatar connu :
             * on ne touche absolument à rien.
             */
            if (!data) return;


            img.classList.add(
                'mgv-switch-avatar'
            );


            img.dataset.avatarLight =
                data.light;


            if (data.dark) {

                img.dataset.avatarDark =
                    data.dark;

            }


            if (
                !img.dataset.mgvAvatarOriginal
            ) {

                img.dataset.mgvAvatarOriginal =
                    data.light;

            }


            /*
             * Si aucun avatar dark n'est renseigné,
             * avatar light utilisé partout.
             */
            const wanted =
                isDark && data.dark
                    ? data.dark
                    : data.light;


            if (
                normalizeUrl(
                    img.getAttribute('src')
                ) !== wanted
            ) {

                img.src = wanted;

            }

        });

    }


    /* =========================================
       RAFRAÎCHISSEMENT
       ========================================= */

    function refresh(root = document) {

        discoverUsers(root);

        updateImages(root);

    }


    /* =========================================
       ÉLÉMENTS AJOUTÉS DYNAMIQUEMENT
       ========================================= */

    let observerTimer;


    const observer =
        new MutationObserver(
            function (mutations) {

                clearTimeout(
                    observerTimer
                );


                observerTimer =
                    setTimeout(
                        function () {

                            mutations.forEach(
                                mutation => {

                                    mutation
                                        .addedNodes
                                        .forEach(
                                            node => {

                                                if (
                                                    node.nodeType !==
                                                    Node.ELEMENT_NODE
                                                ) {
                                                    return;
                                                }

                                                refresh(node);

                                            }
                                        );

                                }
                            );


                            updateImages();

                        },
                        50
                    );

            }
        );


    /* =========================================
       SURVEILLANCE DU LIGHT / DARK
       ========================================= */

    /*
     * On ne touche PAS à ton plugin de thème.
     *
     * On surveille simplement :
     *
     * <html data-color-scheme="dark">
     *
     * Quand sa valeur change, les avatars suivent.
     */
    const themeObserver =
        new MutationObserver(
            function (mutations) {

                mutations.forEach(
                    function (mutation) {

                        if (
                            mutation.type ===
                            'attributes' &&

                            mutation.attributeName ===
                            'data-color-scheme'
                        ) {

                            updateImages();

                        }

                    }
                );

            }
        );


    themeObserver.observe(
        document.documentElement,
        {
            attributes: true,
            attributeFilter: [
                'data-color-scheme'
            ]
        }
    );


    /* =========================================
       OUTILS DE DEBUG
       ========================================= */

    window.MGVAvatars = {

        refresh: refresh,

        update: updateImages,

        loadUser: loadUser,

        clearCache: function () {

            Object.keys(
                localStorage
            ).forEach(key => {

                if (
                    key.startsWith(
                        CONFIG.cachePrefix
                    )
                ) {

                    localStorage.removeItem(
                        key
                    );

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

        registerCurrentProfile();

        refresh();


        if (document.body) {

            observer.observe(
                document.body,
                {
                    childList: true,
                    subtree: true
                }
            );

        }

    }


    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init
        );

    } else {

        init();

    }

})();
