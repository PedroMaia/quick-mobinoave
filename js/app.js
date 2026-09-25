/**
 * MAVE Bus Tracking - Main Application
 */

const App = {
    stops: [],           // Cached stops data
    currentStop: null,   // Currently selected stop
    refreshInterval: null, // Auto-refresh interval ID

    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing MAVE Bus Tracking...');

        // Set up event listeners
        this.setupEventListeners();

        // Load stops from API
        await this.loadStops();

        // Load and display recent stops
        this.renderRecentStops();

        // Show stop list view
        this.showStopListView();
    },

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Search input filter
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.filterStops(e.target.value);
        });

        // Back button
        const backButton = document.getElementById('backButton');
        backButton.addEventListener('click', () => {
            this.showStopListView();
        });
    },

    /**
     * Load all stops from API and cache
     */
    async loadStops() {
        try {
            this.showLoading('stopList', 'A carregar paragens...');

            this.stops = await MaveAPI.getStops();
            console.log(`Loaded ${this.stops.length} stops`);

            // Sort alphabetically by name
            this.stops.sort((a, b) => a.name.localeCompare(b.name, 'pt'));

            // Display all stops
            this.renderStops(this.stops);

            // Hide connection error if it was showing
            this.hideConnectionError();

        } catch (error) {
            this.showConnectionError();
            this.showError('stopList', `
                <p>Não foi possível carregar as paragens.</p>
                <button class="btn btn-primary btn-sm mt-2" onclick="App.loadStops()">
                    Tentar novamente
                </button>
            `);
            console.error('Error loading stops:', error);
        }
    },

    /**
     * Filter stops by search query
     * @param {string} query - Search text
     */
    filterStops(query) {
        if (!query || query.trim() === '') {
            // Show all stops if search is empty
            this.renderStops(this.stops);
            return;
        }

        const searchTerm = query.toLowerCase().trim();
        const filtered = this.stops.filter(stop => {
            return stop.name.toLowerCase().includes(searchTerm) ||
                   stop.nameShort.toLowerCase().includes(searchTerm);
        });

        this.renderStops(filtered);
    },

    /**
     * Render stops list
     * @param {Array} stops - Array of stop objects to display
     */
    renderStops(stops) {
        const stopList = document.getElementById('stopList');

        if (stops.length === 0) {
            stopList.innerHTML = '<p class="text-muted text-center">Nenhuma paragem encontrada.</p>';
            return;
        }

        // Create list group
        const listHTML = stops.map(stop => `
            <a href="#" class="list-group-item list-group-item-action" data-stop-id="${stop.id}">
                <div class="d-flex w-100 justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">${this.escapeHTML(stop.name)}</h6>
                        <small class="text-muted">${this.escapeHTML(stop.nameShort)}</small>
                    </div>
                    <span class="badge bg-primary rounded-pill">›</span>
                </div>
            </a>
        `).join('');

        stopList.innerHTML = `<div class="list-group">${listHTML}</div>`;

        // Add click handlers
        stopList.querySelectorAll('.list-group-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const stopId = item.getAttribute('data-stop-id');
                this.selectStop(stopId);
            });
        });
    },

    /**
     * Handle stop selection
     * @param {string} stopId - Selected stop ID
     */
    async selectStop(stopId) {
        const stop = this.stops.find(s => s.id === stopId);
        if (!stop) return;

        this.currentStop = stop;
        console.log('Selected stop:', stop);

        // Save to recent stops history
        Storage.saveRecentStop(stop);

        // Load and show stop details
        await this.loadStopDetails();
    },

    /**
     * Render recent stops
     */
    renderRecentStops() {
        const recentStops = Storage.getRecentStops();
        const recentContainer = document.getElementById('recentStops');

        if (recentStops.length === 0) {
            recentContainer.innerHTML = '';
            return;
        }

        const recentHTML = `
            <div class="mb-3">
                <h6 class="text-muted mb-2">Recentes</h6>
                <div class="d-flex flex-wrap gap-2">
                    ${recentStops.map(stop => `
                        <button class="btn btn-sm btn-outline-primary recent-stop-btn" data-stop-id="${stop.id}">
                            ${this.escapeHTML(stop.nameShort)}
                        </button>
                    `).join('')}
                    <button class="btn btn-sm btn-outline-danger" id="clearHistoryBtn">
                        Limpar
                    </button>
                </div>
            </div>
        `;

        recentContainer.innerHTML = recentHTML;

        // Add click handlers for recent stops
        recentContainer.querySelectorAll('.recent-stop-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const stopId = btn.getAttribute('data-stop-id');
                this.selectStop(stopId);
            });
        });

        // Add click handler for clear button
        const clearBtn = document.getElementById('clearHistoryBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                Storage.clearRecentStops();
                this.renderRecentStops();
            });
        }
    },

    /**
     * Show stop list view
     */
    showStopListView() {
        // Clear refresh interval when leaving detail view
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        document.getElementById('stopListView').style.display = 'block';
        document.getElementById('stopDetailView').style.display = 'none';

        // Refresh recent stops (in case they were updated)
        this.renderRecentStops();

        // Clear search
        document.getElementById('searchInput').value = '';
        this.renderStops(this.stops);
    },

    /**
     * Load stop details (routes and schedules)
     */
    async loadStopDetails() {
        // Switch to detail view
        document.getElementById('stopListView').style.display = 'none';
        document.getElementById('stopDetailView').style.display = 'block';

        // Clear any existing refresh interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        // Show stop info
        const stopInfo = document.getElementById('stopInfo');
        stopInfo.innerHTML = `
            <div class="card mb-3">
                <div class="card-body">
                    <h5 class="card-title">${this.escapeHTML(this.currentStop.name)}</h5>
                    <p class="card-text text-muted">${this.escapeHTML(this.currentStop.nameShort)}</p>
                </div>
            </div>
        `;

        // Load routes and live data
        await this.refreshStopData();

        // Set up auto-refresh every 20 seconds
        this.refreshInterval = setInterval(() => {
            this.refreshStopData();
        }, 20000);
    },

    /**
     * Refresh stop data (routes + live countdowns)
     */
    async refreshStopData() {
        const routesList = document.getElementById('routesList');

        // Show loading spinner only on first load, not on auto-refresh
        if (!routesList.querySelector('.route-card')) {
            this.showLoading('routesList', 'A carregar rotas...');
        }

        try {
            // Load routes for this stop
            const routes = await MaveAPI.getStopRoutes(this.currentStop.id);
            console.log(`Loaded ${routes.length} routes for stop`);

            // Load live data for each route
            const routesWithLiveData = await this.enrichRoutesWithLiveData(routes);

            this.renderRoutes(routesWithLiveData);

            // Hide connection error if it was showing
            this.hideConnectionError();

        } catch (error) {
            this.showConnectionError();
            this.showError('routesList', `
                <p>Não foi possível carregar as rotas.</p>
                <button class="btn btn-primary btn-sm mt-2" onclick="App.refreshStopData()">
                    Tentar novamente
                </button>
            `);
            console.error('Error loading routes:', error);
        }
    },

    /**
     * Enrich routes with live vehicle countdown data
     * @param {Array} routes - Routes serving the stop
     * @returns {Promise<Array>} - Routes with live data added
     */
    async enrichRoutesWithLiveData(routes) {
        // Process routes in parallel (limited to avoid too many requests)
        const enrichedRoutes = await Promise.all(
            routes.map(async (route) => {
                try {
                    // Get vehicles for this route
                    const vehicles = await MaveAPI.getLocations(route.id);

                    if (vehicles.length === 0) {
                        route.liveData = [];
                        return route;
                    }

                    // Get detailed info for each vehicle (limit to first 3)
                    const vehicleDetails = await Promise.all(
                        vehicles.slice(0, 3).map(vehicle =>
                            MaveAPI.getVehicleDetails(vehicle.id).catch(err => {
                                console.error(`Error loading vehicle ${vehicle.id}:`, err);
                                return null;
                            })
                        )
                    );

                    // Extract countdowns for current stop
                    route.liveData = vehicleDetails
                        .filter(v => v !== null && v.journey && v.journey.circulations)
                        .map(vehicle => this.findStopInCirculations(vehicle.journey.circulations))
                        .filter(countdown => countdown !== null)
                        .sort((a, b) => a.dueInMinutes - b.dueInMinutes);

                } catch (error) {
                    console.error(`Error enriching route ${route.id}:`, error);
                    route.liveData = [];
                }

                return route;
            })
        );

        return enrichedRoutes;
    },

    /**
     * Find current stop in vehicle circulations
     * @param {Array} circulations - Vehicle circulations array
     * @returns {object|null} - Countdown object or null
     */
    findStopInCirculations(circulations) {
        if (!circulations || circulations.length === 0) return null;

        // Look for a circulation matching current stop's nameShort or name
        const match = circulations.find(circ => {
            if (!circ.stage) return false;

            const stageName = circ.stage.nameShort || circ.stage.name || '';
            const stopNameShort = this.currentStop.nameShort || '';
            const stopName = this.currentStop.name || '';

            // Try to match by nameShort first, then by name
            return stageName === stopNameShort ||
                   stageName.includes(stopNameShort) ||
                   circ.stage.name === stopName;
        });

        if (!match || match.dueInMinutes === undefined) return null;

        return {
            dueInMinutes: match.dueInMinutes,
            sequence: match.sequence
        };
    },

    /**
     * Render routes for current stop
     * @param {Array} routes - Array of route objects with journeys and live data
     */
    renderRoutes(routes) {
        const routesList = document.getElementById('routesList');

        if (routes.length === 0) {
            routesList.innerHTML = `
                <div class="alert alert-warning">
                    <p class="mb-0">Sem rotas disponíveis para esta paragem.</p>
                </div>
            `;
            return;
        }

        // Sort routes by nameShort (route number)
        routes.sort((a, b) => {
            const numA = parseInt(a.nameShort) || 0;
            const numB = parseInt(b.nameShort) || 0;
            return numA - numB;
        });

        const now = new Date();
        const timeStr = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

        const routesHTML = routes.map(route => {
            const nextJourneys = this.getNextJourneys(route.journeys, 3);
            const hasLiveData = route.liveData && route.liveData.length > 0;

            return `
                <div class="card mb-3 route-card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <h6 class="mb-1">
                                    <span class="badge" style="background-color: #${route.color || '6c757d'}">
                                        ${this.escapeHTML(route.nameShort)}
                                    </span>
                                    ${hasLiveData ? '<span class="badge bg-success ms-2">AO VIVO</span>' : ''}
                                </h6>
                                <p class="mb-0 small text-muted route-name">${this.escapeHTML(route.name)}</p>
                            </div>
                        </div>

                        ${hasLiveData ? `
                            <div class="mt-3">
                                <small class="text-success d-block mb-2">🚌 Próximos autocarros:</small>
                                <div class="d-flex flex-wrap gap-2">
                                    ${route.liveData.map(live => `
                                        <span class="badge bg-success live-countdown">
                                            ${live.dueInMinutes === 0 ? 'A chegar' : `${live.dueInMinutes} min`}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        ${nextJourneys.length > 0 ? `
                            <div class="mt-3">
                                <small class="text-muted d-block mb-2">${hasLiveData ? 'Horário programado:' : 'Próximas partidas:'}</small>
                                <div class="d-flex flex-wrap gap-2">
                                    ${nextJourneys.map(journey => `
                                        <span class="badge bg-secondary journey-time">${journey}</span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : !hasLiveData ? `
                            <div class="mt-2">
                                <small class="text-muted">Sem partidas agendadas</small>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        routesList.innerHTML = `
            <div class="alert alert-success mb-3">
                <small>✓ Dados em tempo real • Atualizado às ${timeStr} • Atualiza a cada 20s</small>
            </div>
            ${routesHTML}
        `;
    },

    /**
     * Get next N journeys from current time
     * @param {Array} journeys - Array of journey objects
     * @param {number} count - Number of journeys to return
     * @returns {Array} - Array of formatted time strings
     */
    getNextJourneys(journeys, count = 3) {
        if (!journeys || journeys.length === 0) return [];

        const now = new Date();
        const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        // Get journeys with start times in the future
        const upcoming = journeys
            .filter(j => j.startTime > currentSeconds)
            .sort((a, b) => a.startTime - b.startTime)
            .slice(0, count)
            .map(j => this.formatTime(j.startTime));

        return upcoming;
    },

    /**
     * Format seconds since midnight to HH:MM
     * @param {number} seconds - Seconds since midnight
     * @returns {string} - Formatted time string
     */
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    },

    /**
     * Show loading message
     * @param {string} elementId - Target element ID
     * @param {string} message - Loading message
     */
    showLoading(elementId, message) {
        const element = document.getElementById(elementId);
        element.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">A carregar...</span>
                </div>
                <p class="mt-3 text-muted">${message}</p>
            </div>
        `;
    },

    /**
     * Show error message
     * @param {string} elementId - Target element ID
     * @param {string} message - Error message
     */
    showError(elementId, message) {
        const element = document.getElementById(elementId);
        element.innerHTML = `
            <div class="alert alert-danger" role="alert">
                ${message}
            </div>
        `;
    },

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Show connection error alert
     */
    showConnectionError() {
        const alert = document.getElementById('connectionError');
        if (alert) {
            alert.style.display = 'block';
            alert.classList.add('show');
        }
    },

    /**
     * Hide connection error alert
     */
    hideConnectionError() {
        const alert = document.getElementById('connectionError');
        if (alert) {
            alert.style.display = 'none';
            alert.classList.remove('show');
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Handle online/offline events
window.addEventListener('online', () => {
    App.hideConnectionError();
    console.log('Connection restored');
});

window.addEventListener('offline', () => {
    App.showConnectionError();
    console.log('Connection lost');
});
