/**
 * MAVE Bus Tracking - Storage Module
 * Cookie-based storage for recent stops history
 */

const Storage = {
    COOKIE_NAME: 'mave_recent_stops',
    MAX_RECENT: 8,           // Keep last 8 stops
    EXPIRY_DAYS: 30,         // Cookie expires in 30 days

    /**
     * Save a stop to recent history
     * @param {object} stop - Stop object {id, name, nameShort}
     */
    saveRecentStop(stop) {
        // Get current recent stops
        let recent = this.getRecentStops();

        // Remove if already exists (to move to top)
        recent = recent.filter(s => s.id !== stop.id);

        // Add to beginning
        recent.unshift({
            id: stop.id,
            name: stop.name,
            nameShort: stop.nameShort,
            timestamp: new Date().toISOString()
        });

        // Limit to MAX_RECENT
        recent = recent.slice(0, this.MAX_RECENT);

        // Save to cookie
        this.setCookie(this.COOKIE_NAME, JSON.stringify(recent), this.EXPIRY_DAYS);
    },

    /**
     * Get recent stops from cookie
     * @returns {Array} - Array of recent stop objects
     */
    getRecentStops() {
        const cookieValue = this.getCookie(this.COOKIE_NAME);

        if (!cookieValue) {
            return [];
        }

        try {
            return JSON.parse(cookieValue);
        } catch (error) {
            console.error('Error parsing recent stops cookie:', error);
            return [];
        }
    },

    /**
     * Clear recent stops history
     */
    clearRecentStops() {
        this.deleteCookie(this.COOKIE_NAME);
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
