/**
 * MAVE Bus Tracking - Storage Module
 * Cookie-based storage for favorite stops
 */

const Storage = {
    COOKIE_NAME: 'mave_favorite_stops',
    LEGACY_COOKIE_NAME: 'mave_recent_stops',
    MAX_FAVORITES: 20,       // Keeps cookie well under the ~4KB limit
    EXPIRY_DAYS: 365,        // Cookie expires in 1 year

    /**
     * Get favorite stops from cookie
     * @returns {Array} - Array of favorite stop objects {id, name, nameShort}
     */
    getFavorites() {
        const cookieValue = this.getCookie(this.COOKIE_NAME);

        if (!cookieValue) {
            return [];
        }

        try {
            return JSON.parse(decodeURIComponent(cookieValue));
        } catch (error) {
            console.error('Error parsing favorites cookie:', error);
            return [];
        }
    },

    /**
     * Check whether a stop is a favorite
     * @param {string} stopId - Stop ID
     * @returns {boolean}
     */
    isFavorite(stopId) {
        return this.getFavorites().some(s => s.id === stopId);
    },

    /**
     * Add a stop to favorites
     * @param {object} stop - Stop object {id, name, nameShort}
     * @returns {boolean} - False if the favorites limit was reached
     */
    addFavorite(stop) {
        const favorites = this.getFavorites();

        if (favorites.some(s => s.id === stop.id)) {
            return true;
        }

        if (favorites.length >= this.MAX_FAVORITES) {
            return false;
        }

        favorites.push({
            id: stop.id,
            name: stop.name,
            nameShort: stop.nameShort
        });

        this.saveFavorites(favorites);
        return true;
    },

    /**
     * Remove a stop from favorites
     * @param {string} stopId - Stop ID
     */
    removeFavorite(stopId) {
        const favorites = this.getFavorites().filter(s => s.id !== stopId);
        this.saveFavorites(favorites);
    },

    /**
     * Toggle a stop's favorite state
     * @param {object} stop - Stop object {id, name, nameShort}
     * @returns {boolean} - New favorite state
     */
    toggleFavorite(stop) {
        if (this.isFavorite(stop.id)) {
            this.removeFavorite(stop.id);
            return false;
        }

        if (!this.addFavorite(stop)) {
            alert(`Limite de ${this.MAX_FAVORITES} favoritos atingido.`);
            return false;
        }

        return true;
    },

    /**
     * Persist favorites array to cookie
     * @param {Array} favorites - Array of favorite stop objects
     */
    saveFavorites(favorites) {
        if (favorites.length === 0) {
            this.deleteCookie(this.COOKIE_NAME);
            return;
        }

        this.setCookie(this.COOKIE_NAME, encodeURIComponent(JSON.stringify(favorites)), this.EXPIRY_DAYS);
    },

    /**
     * Remove the old "recent stops" cookie from previous versions
     */
    clearLegacyData() {
        if (this.getCookie(this.LEGACY_COOKIE_NAME) !== null) {
            this.deleteCookie(this.LEGACY_COOKIE_NAME);
        }
    },

    /**
     * Set a cookie
     * @param {string} name - Cookie name
     * @param {string} value - Cookie value
     * @param {number} days - Days until expiry
     */
    setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = `expires=${date.toUTCString()}`;
        document.cookie = `${name}=${value};${expires};path=/;SameSite=Lax`;
    },

    /**
     * Get a cookie value
     * @param {string} name - Cookie name
     * @returns {string|null} - Cookie value or null if not found
     */
    getCookie(name) {
        const nameEQ = name + "=";
        const cookies = document.cookie.split(';');

        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i].trim();
            if (cookie.indexOf(nameEQ) === 0) {
                return cookie.substring(nameEQ.length, cookie.length);
            }
        }

        return null;
    },

    /**
     * Delete a cookie
     * @param {string} name - Cookie name
     */
    deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }
};

// Make Storage available globally
window.Storage = Storage;
