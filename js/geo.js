/**
 * MAVE Bus Tracking - Geolocation & distance helpers
 */

const Geo = {
    EARTH_RADIUS: 6371000, // meters
    WALK_SPEED: 80,        // meters per minute (~4.8 km/h)
    leafletPromise: null,  // Cached Leaflet loader

    /**
     * Get the current position once
     * @param {boolean} fresh - Skip the browser's cached position
     * @returns {Promise<{lat: number, lon: number, accuracy: number}>}
     */
    async getPosition(fresh = false) {
        if (!('geolocation' in navigator)) {
            throw new Error('O seu navegador não suporta geolocalização.');
        }

        try {
            // Try GPS first
            return await this.requestPosition({
                enableHighAccuracy: true,
                maximumAge: fresh ? 0 : 60000,
                timeout: 10000
            });
        } catch (error) {
            // Permission denied: retrying won't help
            if (error.code === 1) throw this.positionError(error);

            // GPS unavailable or too slow (common indoors on Android): fall back to Wi-Fi/network location
            try {
                return await this.requestPosition({
                    enableHighAccuracy: false,
                    maximumAge: 300000,
                    timeout: 15000
                });
            } catch (fallbackError) {
                throw this.positionError(fallbackError);
            }
        }
    },

    /**
     * Promise wrapper around getCurrentPosition
     * @param {object} options - PositionOptions
     * @returns {Promise<{lat: number, lon: number, accuracy: number}>}
     */
    requestPosition(options) {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy
                }),
                reject,
                options
            );
        });
    },

    /**
     * Turn a GeolocationPositionError into a user-facing message
     * @param {GeolocationPositionError} error
     * @returns {Error}
     */
    positionError(error) {
        const messages = {
            1: 'Permissão de localização negada. Ative-a nas definições do navegador (ícone 🔒 junto ao endereço → Localização → Permitir).',
            2: 'Não foi possível determinar a sua localização. Verifique se a localização do telemóvel está ligada (Definições → Localização) e tente novamente.',
            3: 'A obtenção da localização demorou demasiado. Verifique se a localização do telemóvel está ligada e tente novamente.'
        };
        return new Error(messages[error.code] || 'Erro ao obter a localização.');
    },

    /**
     * Distance between two points (equirectangular approximation, accurate at city scale)
     * @returns {number} - Distance in meters
     */
    distanceMeters(lat1, lon1, lat2, lon2) {
        const toRad = Math.PI / 180;
        const x = (lon2 - lon1) * toRad * Math.cos(((lat1 + lat2) / 2) * toRad);
        const y = (lat2 - lat1) * toRad;
        return Math.sqrt(x * x + y * y) * this.EARTH_RADIUS;
    },

    /**
     * Format a distance, e.g. "350 m" or "1,2 km"
     * @param {number} meters
     * @returns {string}
     */
    formatDistance(meters) {
        if (meters < 1000) {
            return `${Math.round(meters / 10) * 10} m`;
        }
        return `${(meters / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} km`;
    },

    /**
     * Estimated walking time
     * @param {number} meters
     * @returns {number} - Minutes (at least 1)
     */
    walkMinutes(meters) {
        return Math.max(1, Math.round(meters / this.WALK_SPEED));
    },

    /**
     * Lazy-load Leaflet (CSS + JS) once
     * @returns {Promise<object>} - The global L object
     */
    loadLeaflet() {
        if (window.L) return Promise.resolve(window.L);
        if (this.leafletPromise) return this.leafletPromise;

        const base = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';

        // Wait for the CSS too: a map created before it applies gets a broken first layout
        const cssLoaded = new Promise((resolve) => {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = base + 'leaflet.css';
            css.onload = resolve;
            css.onerror = resolve; // The map still works (unstyled) without it
            document.head.appendChild(css);
        });

        const jsLoaded = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = base + 'leaflet.js';
            script.onload = resolve;
            script.onerror = () => {
                this.leafletPromise = null; // Allow a retry later
                script.remove();
                reject(new Error('Não foi possível carregar o mapa.'));
            };
            document.head.appendChild(script);
        });

        this.leafletPromise = Promise.all([cssLoaded, jsLoaded]).then(() => window.L);
        return this.leafletPromise;
    }
};

window.Geo = Geo;
