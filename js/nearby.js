/**
 * MAVE Bus Tracking - "Perto de mim" tab (stops within a radius of the user)
 */

const Nearby = {
    MAX_RADIUS: 5000,    // Must match the slider's max
    DEFAULT_RADIUS: 2000,
    PAGE_SIZE: 100,      // Rows rendered per "Mostrar mais"
    RADIUS_KEY: 'mave_nearby_radius',
    MANUAL_KEY: 'mave_nearby_manual', // Position picked on the map (fallback when GPS fails)
    REGION_CENTER: [41.40, -8.42],    // Santo Tirso / Famalicão / Guimarães
    REGION_ZOOM: 11,

    initialized: false,
    locating: false,
    picking: false,      // Waiting for a tap on the map
    pickHandler: null,   // Map click listener while picking
    position: null,      // { lat, lon, accuracy, manual? }
    radius: 2000,        // Meters
    sortedStops: [],     // [{ stop, dist }] within MAX_RADIUS, nearest first
    visibleCount: 100,
    renderTimer: null,
    needsFit: false,     // Map was rendered while hidden
    fitMode: 'nearest',  // 'nearest' after a location fix, 'radius' after moving the slider
    NEAREST_FIT_COUNT: 8, // Stops kept in view on the first (closer) zoom

    // Leaflet objects
    map: null,
    radiusCircle: null,
    accuracyCircle: null,
    userMarker: null,
    stopsLayer: null,

    /**
     * Called every time the tab becomes visible
     */
    show() {
        if (!this.initialized) {
            this.init();
            return;
        }

        // Leaflet can't measure a hidden container, so resize after showing it
        if (this.map) {
            this.map.invalidateSize();
            if (this.needsFit) this.fitToRadius();
        }
    },

    /**
     * Set up listeners and get the first location fix
     */
    init() {
        this.initialized = true;

        this.radius = this.loadRadius();
        const slider = document.getElementById('radiusSlider');
        slider.value = this.radius;
        this.renderRadiusLabel();

        slider.addEventListener('input', () => {
            this.radius = parseInt(slider.value, 10);
            this.renderRadiusLabel();

            // Debounce the heavier list/map re-render while dragging
            clearTimeout(this.renderTimer);
            this.renderTimer = setTimeout(() => {
                this.fitMode = 'radius';
                this.visibleCount = this.PAGE_SIZE;
                this.render();
                this.saveRadius();
            }, 150);
        });

        document.getElementById('relocateBtn').addEventListener('click', () => {
            this.locate(true);
        });

        document.getElementById('pickOnMapBtn').addEventListener('click', () => {
            this.pickOnMap();
        });

        // Delegated clicks: list rows and "show more"
        document.getElementById('nearbyList').addEventListener('click', (e) => {
            if (e.target.closest('#nearbyMoreBtn')) {
                this.visibleCount += this.PAGE_SIZE;
                this.renderList(this.countInRadius());
                return;
            }
            this.handleStopClick(e);
        });

        this.locate();
    },

    /**
     * Open the stop detail view when a [data-stop-id] element is clicked
     * @param {Event} e - Click event
     */
    handleStopClick(e) {
        const target = e.target.closest('[data-stop-id]');
        if (!target) return;
        e.preventDefault();
        App.selectStop(target.getAttribute('data-stop-id'));
    },

    /**
     * Get the user's position, compute distances and render
     * @param {boolean} fresh - Force a new GPS fix (refresh button)
     */
    async locate(fresh = false) {
        if (this.locating) return;
        this.locating = true;
        this.cancelPicking();

        const relocateBtn = document.getElementById('relocateBtn');
        const pickOnMapBtn = document.getElementById('pickOnMapBtn');
        relocateBtn.disabled = true;
        pickOnMapBtn.disabled = true;

        // Start loading the map library in parallel; the list doesn't wait for it
        const leaflet = Geo.loadLeaflet().catch(error => {
            console.error('Error loading Leaflet:', error);
            return null;
        });

        if (!this.position) {
            document.getElementById('nearbyCount').textContent = '';
            App.showLoading('nearbyList', 'A obter a sua localização...');
        }

        try {
            let gpsError = null;
            try {
                this.position = await Geo.getPosition(fresh);
            } catch (geoError) {
                // GPS failed: fall back to the position picked on the map earlier
                const saved = this.loadManualPosition();
                if (!saved) throw geoError;
                console.error('Location unavailable, using the position picked on the map:', geoError);
                this.position = saved;
                gpsError = geoError;
            }

            await this.ensureStops();

            // Keep the real reason visible, so the user can fix the phone setting behind it
            this.setNotice(gpsError
                ? `⚠️ A usar a posição escolhida no mapa. Motivo: ${gpsError.message}`
                : '', 'warning');
            this.computeDistances();
            this.fitMode = 'nearest';
            this.visibleCount = this.PAGE_SIZE;
            this.render();
            this.renderUpdated();

            const L = await leaflet;
            if (L) {
                if (!this.map) this.initMap(L, [this.position.lat, this.position.lon], 16);
                this.updateUserMarker();
                this.renderMap();
            }
        } catch (error) {
            console.error('Error locating nearby stops:', error);
            document.getElementById('nearbyCount').textContent = '';
            this.setNotice('');
            App.showError('nearbyList', `
                <p>${App.escapeHTML(error.message)}</p>
                <button class="btn btn-primary btn-sm mt-2" onclick="Nearby.locate()">
                    Tentar novamente
                </button>
                <button class="btn btn-outline-primary btn-sm mt-2 ms-1" onclick="Nearby.pickOnMap()">
                    🗺️ Escolher no mapa
                </button>
            `);
        } finally {
            this.locating = false;
            relocateBtn.disabled = false;
            pickOnMapBtn.disabled = false;
        }
    },

    /**
     * Stops are loaded by App.init(); retry if that load failed
     */
    async ensureStops() {
        await App.stopsReady;
        if (App.stops.length === 0) {
            await App.loadStops();
        }
        if (App.stops.length === 0) {
            throw new Error('Não foi possível carregar as paragens.');
        }
    },

    /**
     * Let the user tap their position on the map (when GPS isn't available)
     */
    async pickOnMap() {
        if (this.picking || this.locating) return;
        this.picking = true;
        this.setNotice('👆 Toque no mapa onde está.', 'hint');

        let L;
        try {
            [L] = await Promise.all([Geo.loadLeaflet(), this.ensureStops()]);
        } catch (error) {
            console.error('Error opening the map to pick a position:', error);
            this.picking = false;
            this.setNotice('');
            App.showError('nearbyList', `<p>${App.escapeHTML(error.message)}</p>`);
            return;
        }
        if (!this.picking) return; // Cancelled by "Atualizar localização" meanwhile

        if (!this.map) {
            const start = this.position || this.loadManualPosition();
            if (start) {
                this.initMap(L, [start.lat, start.lon], 16);
            } else {
                this.initMap(L, this.REGION_CENTER, this.REGION_ZOOM);
            }
        }

        const container = this.map.getContainer();
        container.classList.add('picking');
        this.map.invalidateSize();
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });

        this.pickHandler = (e) => {
            this.cancelPicking();
            this.setManualPosition(e.latlng);
        };
        this.map.once('click', this.pickHandler);
    },

    /**
     * Stop waiting for a tap on the map
     */
    cancelPicking() {
        if (!this.picking) return;
        this.picking = false;
        if (this.map) {
            if (this.pickHandler) this.map.off('click', this.pickHandler);
            this.map.getContainer().classList.remove('picking');
        }
        this.pickHandler = null;
        this.setNotice('');
    },

    /**
     * Use a position picked on the map, and remember it for next time
     * @param {object} latlng - Leaflet LatLng
     */
    setManualPosition(latlng) {
        this.position = { lat: latlng.lat, lon: latlng.lng, accuracy: 0, manual: true };
        this.saveManualPosition();

        this.computeDistances();
        this.fitMode = 'nearest';
        this.visibleCount = this.PAGE_SIZE;
        this.updateUserMarker(); // Before render: the radius circle must be on the map to be measured
        this.render();
        this.renderUpdated();
    },

    /**
     * Hint or warning line above the list ('' hides it)
     * @param {string} text
     * @param {string} kind - 'hint' or 'warning'
     */
    setNotice(text, kind = 'hint') {
        const notice = document.getElementById('nearbyNotice');
        notice.className = `nearby-notice nearby-notice-${kind} mb-2`;
        notice.textContent = text;
    },

    /**
     * Compute the distance to every stop once per location fix.
     * The slider then only needs to cut the sorted array.
     */
    computeDistances() {
        const { lat, lon } = this.position;

        // Cheap bounding-box pre-filter before the real distance
        const dLat = this.MAX_RADIUS / 111320;
        const dLon = this.MAX_RADIUS / (111320 * Math.cos(lat * Math.PI / 180));

        const result = [];
        for (const stop of App.stops) {
            const sLat = stop.position.lat;
            const sLon = stop.position.lon;
            if (Math.abs(sLat - lat) > dLat || Math.abs(sLon - lon) > dLon) continue;

            const dist = Geo.distanceMeters(lat, lon, sLat, sLon);
            if (dist <= this.MAX_RADIUS) {
                result.push({ stop, dist });
            }
        }

        result.sort((a, b) => a.dist - b.dist);
        this.sortedStops = result;
    },

    /**
     * Number of stops within the current radius (binary search on the sorted array)
     * @returns {number}
     */
    countInRadius() {
        let lo = 0;
        let hi = this.sortedStops.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.sortedStops[mid].dist <= this.radius) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    },

    /**
     * Render count, list and map for the current radius
     */
    render() {
        if (!this.position) return;

        const total = this.countInRadius();
        document.getElementById('nearbyCount').textContent =
            `${total} ${total === 1 ? 'paragem encontrada' : 'paragens encontradas'}`;

        this.renderList(total);
        this.renderMap();
    },

    /**
     * Render the list of nearby stops
     * @param {number} total - Stops within the radius
     */
    renderList(total) {
        const list = document.getElementById('nearbyList');

        if (total === 0) {
            list.innerHTML = '<p class="text-muted text-center">Nenhuma paragem neste raio. Experimente aumentar o raio.</p>';
            return;
        }

        const favoriteIds = new Set(Storage.getFavorites().map(s => s.id));
        const shown = this.sortedStops.slice(0, Math.min(total, this.visibleCount));

        const rowsHTML = shown.map(({ stop, dist }) => `
            <a href="#" class="list-group-item list-group-item-action" data-stop-id="${App.escapeHTML(stop.id)}">
                <div class="d-flex w-100 justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">
                            ${favoriteIds.has(stop.id) ? '<span class="favorite-mark" title="Favorito">★</span> ' : ''}${App.escapeHTML(stop.name)}
                        </h6>
                        <small class="text-muted">${App.escapeHTML(stop.nameShort)}</small>
                    </div>
                    <div class="text-end flex-shrink-0 ms-2">
                        <span class="distance-badge">${Geo.formatDistance(dist)}</span>
                        <small class="d-block text-muted walk-time">~${Geo.walkMinutes(dist)} min a pé</small>
                    </div>
                </div>
            </a>
        `).join('');

        const remaining = total - shown.length;
        list.innerHTML = `
            <div class="list-group">${rowsHTML}</div>
            ${remaining > 0 ? `
                <button id="nearbyMoreBtn" class="btn btn-outline-primary w-100 mt-2">
                    Mostrar mais (${remaining})
                </button>
            ` : ''}
        `;
    },

    /**
     * Create the Leaflet map (canvas renderer keeps many markers fast).
     * The position layers are added by updateUserMarker() once there is a position.
     * @param {object} L - Leaflet global
     * @param {Array<number>} center - [lat, lon]
     * @param {number} zoom
     */
    initMap(L, center, zoom) {
        const container = document.getElementById('nearbyMap');
        container.style.display = 'block';

        // Fractional zoom lets fitBounds fill the map instead of rounding down a whole level
        this.map = L.map(container, { preferCanvas: true, zoomSnap: 0.25 }).setView(center, zoom);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(this.map);

        this.radiusCircle = L.circle(center, {
            radius: this.radius,
            color: '#0d6efd',
            weight: 1.5,
            fillOpacity: 0.06,
            interactive: false
        });

        this.accuracyCircle = L.circle(center, {
            radius: 0,
            stroke: false,
            fillColor: '#0d6efd',
            fillOpacity: 0.15,
            interactive: false
        });

        this.stopsLayer = L.layerGroup().addTo(this.map);

        // "Ver horários" link inside a stop popup
        this.map.on('popupopen', (e) => {
            const link = e.popup.getElement().querySelector('[data-stop-id]');
            if (link) link.addEventListener('click', (ev) => this.handleStopClick(ev));
        });

        // Own pane + canvas so stop re-renders (shared canvas, painted in add order) never cover the dot
        this.map.createPane('userPane');
        this.map.getPane('userPane').style.zIndex = 450;

        this.userMarker = L.circleMarker(center, {
            pane: 'userPane',
            renderer: L.canvas({ pane: 'userPane' }),
            radius: 8,
            color: '#fff',
            weight: 3,
            fillColor: '#0d6efd',
            fillOpacity: 1
        }).bindTooltip('Está aqui');
    },

    /**
     * Move the "you are here" marker to the current position (adding it on the first fix)
     */
    updateUserMarker() {
        if (!this.map || !this.position) return;
        const center = [this.position.lat, this.position.lon];
        this.userMarker.setLatLng(center);
        this.accuracyCircle.setLatLng(center).setRadius(this.position.accuracy || 0);
        this.radiusCircle.setLatLng(center);

        [this.radiusCircle, this.accuracyCircle, this.userMarker].forEach(layer => {
            if (!this.map.hasLayer(layer)) layer.addTo(this.map);
        });
    },

    /**
     * Draw stops within the radius on the map
     */
    renderMap() {
        if (!this.map) return;

        const favoriteIds = new Set(Storage.getFavorites().map(s => s.id));
        const total = this.countInRadius();

        this.radiusCircle.setRadius(this.radius);
        this.stopsLayer.clearLayers();

        for (let i = 0; i < total; i++) {
            const { stop, dist } = this.sortedStops[i];
            const isFavorite = favoriteIds.has(stop.id);

            L.circleMarker([stop.position.lat, stop.position.lon], {
                radius: 6,
                color: '#fff',
                weight: 2,
                fillColor: isFavorite ? '#f5b301' : '#198754',
                fillOpacity: 1
            }).bindPopup(`
                <strong>${App.escapeHTML(stop.name)}</strong><br>
                <small class="text-muted">${Geo.formatDistance(dist)} • ~${Geo.walkMinutes(dist)} min a pé</small><br>
                <a href="#" data-stop-id="${App.escapeHTML(stop.id)}">Ver horários →</a>
            `).addTo(this.stopsLayer);
        }

        this.fitToRadius();
    },

    /**
     * Zoom the map: close-up on the user and the nearest stops after a location fix,
     * or the whole radius circle after the slider moves
     */
    fitToRadius() {
        // A hidden container has no size; fit again when the tab is shown
        if (document.getElementById('nearbyMap').offsetWidth === 0) {
            this.needsFit = true;
            return;
        }
        this.needsFit = false;

        if (this.fitMode === 'radius') {
            this.map.fitBounds(this.radiusCircle.getBounds(), { padding: [10, 10] });
            return;
        }

        const center = [this.position.lat, this.position.lon];
        const nearest = this.sortedStops.slice(0, Math.min(this.countInRadius(), this.NEAREST_FIT_COUNT));
        if (nearest.length === 0) {
            this.map.setView(center, 16);
            return;
        }

        const bounds = L.latLngBounds([center, ...nearest.map(({ stop }) => [stop.position.lat, stop.position.lon])]);
        this.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
    },

    /**
     * Update the radius badge next to the slider
     */
    renderRadiusLabel() {
        document.getElementById('radiusValue').textContent = Geo.formatDistance(this.radius);
    },

    /**
     * Show when the location was last updated
     */
    renderUpdated() {
        const time = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('nearbyUpdated').textContent = this.position && this.position.manual
            ? `📍 Posição escolhida no mapa às ${time}`
            : `🕒 Localização às ${time}`;
    },

    /**
     * Last position picked on the map
     * @returns {object|null} - { lat, lon, accuracy, manual }
     */
    loadManualPosition() {
        try {
            const saved = JSON.parse(localStorage.getItem(this.MANUAL_KEY));
            if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
                return { lat: saved.lat, lon: saved.lon, accuracy: 0, manual: true };
            }
        } catch (error) {
            // Storage unavailable or corrupt data
        }
        return null;
    },

    saveManualPosition() {
        try {
            localStorage.setItem(this.MANUAL_KEY, JSON.stringify({ lat: this.position.lat, lon: this.position.lon }));
        } catch (error) {
            // Storage unavailable: ignore
        }
    },

    /**
     * Last radius the user picked (per-browser convenience)
     * @returns {number}
     */
    loadRadius() {
        try {
            const saved = parseInt(localStorage.getItem(this.RADIUS_KEY), 10);
            if (saved >= 200 && saved <= this.MAX_RADIUS) return saved;
        } catch (error) {
            // Storage unavailable (private mode etc.)
        }
        return this.DEFAULT_RADIUS;
    },

    saveRadius() {
        try {
            localStorage.setItem(this.RADIUS_KEY, String(this.radius));
        } catch (error) {
            // Storage unavailable: ignore
        }
    }
};

window.Nearby = Nearby;
