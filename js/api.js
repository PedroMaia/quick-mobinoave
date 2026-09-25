/**
 * MAVE API Client
 * Wrapper for the MAVE bus tracking API endpoints
 * Base URL: https://mave.elevensystems.pt/api
 */

const MaveAPI = {
    baseURL: 'https://mave.elevensystems.pt/api',

    /**
     * Generic fetch wrapper with error handling
     * @param {string} endpoint - API endpoint path
     * @param {object} params - Query parameters
     * @returns {Promise<object>} - Parsed JSON response
     */
    async fetchAPI(endpoint, params = {}) {
        try {
            // Build URL with query parameters
            const url = new URL(endpoint, this.baseURL);
            Object.keys(params).forEach(key => {
                url.searchParams.append(key, params[key]);
            });

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            // Check for CORS errors
            if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
                console.error('CORS ou erro de rede. Verifique a ligação à internet.');
                throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
            }

            console.error('API Error:', error);
            throw error;
        }
    },

    /**
     * Get all bus stops in the network (~2500 stops)
     * @returns {Promise<Array>} - Array of stop objects with id, name, nameShort, position
     */
    async getStops() {
        const stops = await this.fetchAPI('/stops');

        // Filter out stops without coordinates (known data quality issue)
        return stops.filter(stop => stop.position && stop.position.lat && stop.position.lon);
    },

    /**
     * Get routes serving a specific stop
     * @param {string} stopId - Stop ID
     * @returns {Promise<Array>} - Array of routes with journeys
     */
    async getStopRoutes(stopId) {
        return await this.fetchAPI(`/stops/${stopId}/routes`, {
            shape: 'false',
            passengerInfo: 'true'
        });
    },

    /**
     * Get all active routes in the network
     * @returns {Promise<Array>} - Array of route objects
     */
    async getRoutes() {
        const routes = await this.fetchAPI('/routes', {
            active: 'true',
            passengerInfo: 'true'
        });

        // Filter to only active routes (API returns inactive despite active=true)
        return routes.filter(route => route.isActive);
    },

    /**
     * Get live vehicle positions
     * @param {string} routeId - Optional: filter by route ID
     * @returns {Promise<Array>} - Array of vehicle location objects
     */
    async getLocations(routeId = null) {
        const params = { passengerInfo: 'true' };

        if (routeId) {
            params.routeId = routeId;
        }

        return await this.fetchAPI('/locations', params);
    },

    /**
     * Get detailed information for a specific vehicle
     * Includes route info and circulations with dueInMinutes
     * @param {string} vehicleId - Vehicle/entity ID
     * @returns {Promise<object>} - Vehicle details with journey and circulations
     */
    async getVehicleDetails(vehicleId) {
        return await this.fetchAPI(`/locations/${vehicleId}`);
    }
};

// Make API available globally
window.MaveAPI = MaveAPI;
