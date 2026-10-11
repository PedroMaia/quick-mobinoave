/**
 * MAVE Bus Tracking - Small map of the current stop (only the stop, shown on every stop page)
 */

const StopMap = {
    map: null,
    request: 0,          // Guards against a slow Leaflet load after another stop was opened

    /**
     * Show the map card for a stop
     * @param {object} stop - Stop object with position
     */
    async open(stop) {
        this.destroy();
        const requestId = ++this.request;
        if (!stop || !stop.position) return;

        const card = document.getElementById('stopMapCard');
        card.innerHTML = '<div id="stopMap" class="stop-map mb-3"></div>';

        let L;
        try {
            L = await Geo.loadLeaflet();
        } catch (error) {
            // The stop page works without the map
            console.error('Error loading Leaflet:', error);
            if (requestId === this.request) card.innerHTML = '';
            return;
        }
        if (requestId !== this.request) return;

        const stopLatLng = [stop.position.lat, stop.position.lon];
        this.map = L.map('stopMap', { preferCanvas: true, zoomSnap: 0.25 }).setView(stopLatLng, 17);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(this.map);

        L.circleMarker(stopLatLng, {
            radius: 8,
            color: '#fff',
            weight: 3,
            fillColor: '#dc3545',
            fillOpacity: 1
        }).bindTooltip(App.escapeHTML(stop.name)).addTo(this.map);
    },

    /**
     * Show the card again (after the live bus map is closed)
     */
    show() {
        const card = document.getElementById('stopMapCard');
        if (!card) return;
        card.style.display = '';
        // Leaflet measures its container: refresh after it was hidden
        if (this.map) this.map.invalidateSize();
    },

    /**
     * Hide the card while the live bus map is open
     */
    hide() {
        const card = document.getElementById('stopMapCard');
        if (card) card.style.display = 'none';
    },

    /**
     * Remove the map (opening another stop or leaving the stop page)
     */
    destroy() {
        this.request++;
        if (this.map) this.map.remove();
        this.map = null;

        const card = document.getElementById('stopMapCard');
        if (card) {
            card.innerHTML = '';
            card.style.display = '';
        }
    }
};

window.StopMap = StopMap;
