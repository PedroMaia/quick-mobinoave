/**
 * MAVE Bus Tracking - Live map of a line's buses heading to the current stop
 */

const BusMap = {
    map: null,
    route: null,         // Route shown (from the stop page)
    stop: null,          // Current stop
    stopMarker: null,
    routeLine: null,
    shape: null,         // Encoded shape currently drawn
    busMarkers: new Map(), // vehicleId -> Leaflet marker (moved in place so open popups survive refreshes)
    request: 0,          // Guards against a slow Leaflet load after the map was closed

    /**
     * Show the map card for a line at the current stop
     * @param {object} route - Route with liveData (from MaveAPI.getArrivals)
     * @param {object} stop - Stop object with position
     */
    async open(route, stop) {
        this.destroy();
        const requestId = ++this.request;
        this.route = route;
        this.stop = stop;

        const card = document.getElementById('busMapCard');
        card.innerHTML = `
            <div class="card mb-3 bus-map-card">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-center mb-2 px-1">
                        <div>
                            <span class="badge" style="background-color: #${route.color || '6c757d'}">${App.escapeHTML(route.nameShort)}</span>
                            <small id="busMapStatus" class="text-muted ms-2">A carregar mapa...</small>
                        </div>
                        <button id="busMapClose" class="btn btn-sm btn-outline-secondary" aria-label="Fechar mapa">✕</button>
                    </div>
                    <div id="busMap" class="bus-map"></div>
                </div>
            </div>
        `;
        document.getElementById('busMapClose').addEventListener('click', () => this.destroy());
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });

        let L;
        try {
            L = await Geo.loadLeaflet();
        } catch (error) {
            console.error('Error loading Leaflet:', error);
            this.setStatus(error.message);
            return;
        }
        if (requestId !== this.request) return;

        const stopLatLng = [stop.position.lat, stop.position.lon];
        this.map = L.map('busMap', { preferCanvas: true, zoomSnap: 0.25 }).setView(stopLatLng, 15);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(this.map);

        this.stopMarker = L.circleMarker(stopLatLng, {
            radius: 8,
            color: '#fff',
            weight: 3,
            fillColor: '#dc3545',
            fillOpacity: 1
        }).bindTooltip(App.escapeHTML(stop.name)).addTo(this.map);

        this.update(route.liveData || [], true);
    },

    /**
     * Called after each stop page refresh with the fresh routes
     * @param {Array} routes - Routes with liveData
     */
    refresh(routes) {
        if (!this.map || !this.route) return;
        const route = routes.find(r => r.id === this.route.id);
        if (route) this.update(route.liveData || [], false);
    },

    /**
     * Draw the route line and move the bus markers
     * @param {Array} arrivals - From MaveAPI.getArrivals, nearest first
     * @param {boolean} fit - Zoom to the stop and the buses (first draw only)
     */
    update(arrivals, fit) {
        const color = `#${this.route.color || '6c757d'}`;

        // Route line of the nearest bus's journey (each direction has its own shape)
        const withShape = arrivals.find(a => a.shape);
        if (withShape && withShape.shape !== this.shape) {
            if (this.routeLine) this.routeLine.remove();
            this.routeLine = L.polyline(Geo.decodePolyline(withShape.shape), {
                color,
                weight: 4,
                opacity: 0.7,
                interactive: false
            }).addTo(this.map);
            this.shape = withShape.shape;
        }

        // Move existing markers, add new buses, drop buses that passed the stop
        const seen = new Set();
        arrivals.forEach(arrival => {
            if (!arrival.position) return;
            seen.add(arrival.vehicleId);

            const latLng = [arrival.position.lat, arrival.position.lon];
            const label = `${App.escapeHTML(this.route.nameShort)} · ${arrival.dueInMinutes === 0 ? 'a chegar' : `chega em ${arrival.dueInMinutes} min`}`;
            let marker = this.busMarkers.get(arrival.vehicleId);

            if (marker) {
                marker.setLatLng(latLng).setPopupContent(label);
            } else {
                // DOM marker: drawn above the canvas route line and stop
                marker = L.marker(latLng, {
                    icon: L.divIcon({
                        className: '',
                        html: `<div class="bus-marker" style="background-color: ${color}">🚌</div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    })
                }).bindPopup(label).addTo(this.map);
                this.busMarkers.set(arrival.vehicleId, marker);
            }
        });

        this.busMarkers.forEach((marker, vehicleId) => {
            if (!seen.has(vehicleId)) {
                marker.remove();
                this.busMarkers.delete(vehicleId);
            }
        });

        const count = seen.size;
        this.setStatus(count === 0
            ? 'Sem autocarros desta linha a caminho agora'
            : `${count} ${count === 1 ? 'autocarro a caminho' : 'autocarros a caminho'} • atualiza a cada 20s`);

        if (fit) {
            const points = [this.stopMarker.getLatLng(), ...[...this.busMarkers.values()].map(m => m.getLatLng())];
            if (points.length > 1) {
                this.map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 });
            }
        }
    },

    setStatus(text) {
        const status = document.getElementById('busMapStatus');
        if (status) status.textContent = text;
    },

    /**
     * Remove the map (closing it or leaving the stop page)
     */
    destroy() {
        this.request++;
        if (this.map) this.map.remove();
        this.map = null;
        this.route = null;
        this.stop = null;
        this.stopMarker = null;
        this.routeLine = null;
        this.shape = null;
        this.busMarkers = new Map();

        const card = document.getElementById('busMapCard');
        if (card) card.innerHTML = '';
    }
};

window.BusMap = BusMap;
