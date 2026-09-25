/**
 * MAVE Bus Tracking - Main Application
 */

const App = {
    stops: [],           // Cached stops data
    currentStop: null,   // Currently selected stop

    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing MAVE Bus Tracking...');

        // Set up event listeners
        this.setupEventListeners();

        // Load stops from API
        await this.loadStops();

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

        } catch (error) {
            this.showError('stopList', 'Não foi possível carregar as paragens. Verifique sua conexão.');
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
    selectStop(stopId) {
        const stop = this.stops.find(s => s.id === stopId);
        if (!stop) return;

        this.currentStop = stop;
        console.log('Selected stop:', stop);

        // TODO: Load stop details (Step 5)
        // For now, just show a placeholder
        this.showStopDetailView();
    },

    /**
     * Show stop list view
     */
    showStopListView() {
        document.getElementById('stopListView').style.display = 'block';
        document.getElementById('stopDetailView').style.display = 'none';

        // Clear search
        document.getElementById('searchInput').value = '';
        this.renderStops(this.stops);
    },

    /**
     * Show stop detail view
     */
    showStopDetailView() {
        document.getElementById('stopListView').style.display = 'none';
        document.getElementById('stopDetailView').style.display = 'block';

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

        // Placeholder for routes (Step 5)
        const routesList = document.getElementById('routesList');
        routesList.innerHTML = `
            <div class="alert alert-info">
                <p class="mb-0">Detalhes das rotas serão implementados no próximo passo.</p>
            </div>
        `;
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
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
