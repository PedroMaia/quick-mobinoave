/**
 * MAVE Bus Tracking - Arrival alerts
 * One-shot: warns once when the next bus of a line is X minutes from a stop, then switches off.
 * Runs while the app is open (static site, no push server).
 */

const Alerts = {
    POLL_MS: 30000,
    MAX_AGE_MS: 3 * 60 * 60 * 1000, // Forgotten alerts expire after 3 h
    MINUTE_CHOICES: [2, 3, 5, 10, 15, 20, 30],
    DEFAULT_MINUTES: 5,
    LAST_MINUTES_KEY: 'mave_alert_minutes',

    timer: null,
    checking: false,
    nextDue: {},         // alertId -> minutes of the next bus, null = none on the way (shown in the bar)
    draft: null,         // { route, stop } being edited in the dialog
    wakeLock: null,
    wantWakeLock: false,
    audioCtx: null,

    /**
     * Wire the dialog and start watching saved alerts
     */
    init() {
        const minutesGroup = document.getElementById('alertMinutes');
        minutesGroup.innerHTML = this.MINUTE_CHOICES.map(min => `
            <input type="radio" class="btn-check" name="alertMinutes" id="alertMin${min}" value="${min}" autocomplete="off">
            <label class="btn btn-outline-primary" for="alertMin${min}">${min} min</label>
        `).join('');

        document.getElementById('alertSaveBtn').addEventListener('click', () => this.save());
        document.getElementById('alertRemoveBtn').addEventListener('click', () => {
            if (!this.draft) return;
            this.remove(`${this.draft.stop.id}:${this.draft.route.id}`);
            this.getModal().hide();
        });

        // Delegated clicks in the "Alertas ativos" bar
        const bar = document.getElementById('alertsBar');
        bar.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('[data-remove-alert]');
            if (removeBtn) {
                this.remove(removeBtn.getAttribute('data-remove-alert'));
                return;
            }
            const chip = e.target.closest('[data-open-stop]');
            if (chip) App.selectStop(chip.getAttribute('data-open-stop'));
        });
        bar.addEventListener('change', (e) => {
            if (e.target.id === 'wakeLockSwitch') this.setWakeLock(e.target.checked);
        });

        document.getElementById('alertBanner').addEventListener('click', (e) => {
            if (e.target.closest('[data-close-banner]')) {
                this.hideBanner();
                return;
            }
            const link = e.target.closest('[data-open-stop]');
            if (link) {
                e.preventDefault();
                this.hideBanner();
                App.selectStop(link.getAttribute('data-open-stop'));
            }
        });

        // Timers are throttled in the background: check as soon as the app is back on screen
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            if (this.wantWakeLock && !this.wakeLock) this.requestWakeLock();
            if (Storage.getAlerts().length > 0) this.check();
        });

        this.renderBar();
        if (Storage.getAlerts().length > 0) {
            this.start();
            this.check();
        }
    },

    getModal() {
        return bootstrap.Modal.getOrCreateInstance(document.getElementById('alertModal'));
    },

    /**
     * Open the alert dialog for a line at a stop
     * @param {object} route - Route from the stop page
     * @param {object} stop - Current stop
     */
    openDialog(route, stop) {
        this.draft = { route, stop };
        const existing = Storage.getAlert(stop.id, route.id);
        const minutes = existing ? existing.minutes : this.loadLastMinutes();

        document.getElementById('alertModalTitle').innerHTML = `
            Avisar quando o
            <span class="badge" style="background-color: #${route.color || '6c757d'}">${App.escapeHTML(route.nameShort)}</span>
            estiver a…
        `;
        document.getElementById('alertModalStop').textContent = stop.name;

        const radio = document.getElementById(`alertMin${minutes}`) || document.getElementById(`alertMin${this.DEFAULT_MINUTES}`);
        radio.checked = true;

        document.getElementById('alertRemoveBtn').style.display = existing ? '' : 'none';
        document.getElementById('alertSaveBtn').textContent = existing ? 'Atualizar alerta' : 'Ativar alerta';
        document.getElementById('alertModalHint').innerHTML = this.permissionHint();

        this.getModal().show();
    },

    /**
     * Explain what to expect, depending on notification support/permission
     * @returns {string} - HTML
     */
    permissionHint() {
        const keepOpen = 'Mantenha a app aberta (pode bloquear o ecrã). O alerta desliga-se depois de avisar.';

        if (!('Notification' in window)) {
            return `${keepOpen}<br>⚠️ Este navegador não suporta notificações: o alerta vai tocar e vibrar só com a app no ecrã.`;
        }
        if (Notification.permission === 'denied') {
            return `${keepOpen}<br>⚠️ As notificações estão bloqueadas. Para as ativar: ícone 🔒 junto ao endereço → Notificações → Permitir.`;
        }
        return keepOpen;
    },

    /**
     * Save the alert from the dialog (runs in the click, so the permission prompt is allowed)
     */
    async save() {
        if (!this.draft) return;
        const { route, stop } = this.draft;
        const checked = document.querySelector('input[name="alertMinutes"]:checked');
        const minutes = parseInt(checked ? checked.value : this.DEFAULT_MINUTES, 10);

        // Unlock audio during the tap: browsers block sound started later without a gesture
        this.unlockAudio();

        const alert = {
            id: `${stop.id}:${route.id}`,
            stopId: stop.id,
            stopName: stop.name,
            routeId: route.id,
            routeShort: route.nameShort,
            routeColor: route.color || '6c757d',
            minutes,
            createdAt: Date.now()
        };

        if (!Storage.saveAlert(alert)) {
            window.alert(Storage.getAlerts().length >= Storage.MAX_ALERTS
                ? `Limite de ${Storage.MAX_ALERTS} alertas atingido.`
                : 'Não foi possível guardar o alerta neste navegador.');
            return;
        }
        this.saveLastMinutes(minutes);
        this.getModal().hide();

        if ('Notification' in window && Notification.permission === 'default') {
            try {
                await Notification.requestPermission();
            } catch (error) {
                console.error('Notification permission request failed:', error);
            }
        }

        delete this.nextDue[alert.id];
        this.renderBar();
        App.updateAlertButtons();
        this.start();
        this.check();
    },

    /**
     * Cancel an alert
     * @param {string} alertId - stopId:routeId
     */
    remove(alertId) {
        Storage.removeAlert(alertId);
        delete this.nextDue[alertId];
        if (Storage.getAlerts().length === 0) this.stop();
        this.renderBar();
        App.updateAlertButtons();
    },

    start() {
        if (!this.timer) {
            this.timer = setInterval(() => this.check(), this.POLL_MS);
        }
    },

    stop() {
        clearInterval(this.timer);
        this.timer = null;
        this.setWakeLock(false);
    },

    /**
     * Poll the next bus of every alert and fire the ones that are due
     */
    async check() {
        if (this.checking) return;
        this.checking = true;

        try {
            // Expire forgotten alerts
            const now = Date.now();
            Storage.getAlerts()
                .filter(a => now - a.createdAt > this.MAX_AGE_MS)
                .forEach(a => {
                    Storage.removeAlert(a.id);
                    delete this.nextDue[a.id];
                });

            const alerts = Storage.getAlerts();
            if (alerts.length === 0) {
                this.stop();
                return;
            }

            await Promise.all(alerts.map(async (alert) => {
                let arrivals;
                try {
                    arrivals = await MaveAPI.getArrivals(alert.routeId, alert.stopId);
                } catch (error) {
                    // Network hiccup: keep the alert and try again on the next poll
                    console.error(`Error checking alert ${alert.id}:`, error);
                    return;
                }

                const next = arrivals[0];
                this.nextDue[alert.id] = next ? next.dueInMinutes : null;

                // Skip if it was cancelled while the request was in flight
                if (next && next.dueInMinutes <= alert.minutes && Storage.getAlert(alert.stopId, alert.routeId)) {
                    await this.fire(alert, next.dueInMinutes);
                }
            }));

            if (Storage.getAlerts().length === 0) this.stop();
        } finally {
            this.checking = false;
            this.renderBar();
        }
    },

    /**
     * Warn the user: system notification + in-page banner + sound + vibration
     * @param {object} alert
     * @param {number} due - Minutes until the bus reaches the stop
     */
    async fire(alert, due) {
        Storage.removeAlert(alert.id);
        delete this.nextDue[alert.id];

        const title = due === 0 ? `🚌 ${alert.routeShort} a chegar` : `🚌 ${alert.routeShort} a ${due} min`;
        const body = alert.stopName;

        await this.notify(title, body, alert);
        this.showBanner(title, body, alert.stopId);
        this.beep();
        if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);

        App.updateAlertButtons();
    },

    /**
     * System notification. Android Chrome only allows them through the service worker.
     */
    async notify(title, body, alert) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const options = {
            body,
            tag: alert.id,
            renotify: true,
            requireInteraction: true,
            icon: 'icons/icon.svg',
            badge: 'icons/icon.svg',
            vibrate: [300, 150, 300, 150, 300],
            data: { stopId: alert.stopId }
        };

        try {
            const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
            if (registration) {
                await registration.showNotification(title, options);
                return;
            }
            new Notification(title, options); // Desktop fallback without a service worker
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    },

    showBanner(title, body, stopId) {
        const banner = document.getElementById('alertBanner');
        banner.innerHTML = `
            <div class="alert alert-warning alert-banner d-flex justify-content-between align-items-start mb-0" role="alert">
                <div>
                    <strong>${App.escapeHTML(title)}</strong>
                    <div class="small">${App.escapeHTML(body)}</div>
                    <a href="#" class="small" data-open-stop="${App.escapeHTML(stopId)}">Ver paragem →</a>
                </div>
                <button type="button" class="btn-close" data-close-banner aria-label="Fechar"></button>
            </div>
        `;
        banner.style.display = 'block';
    },

    hideBanner() {
        const banner = document.getElementById('alertBanner');
        banner.style.display = 'none';
        banner.innerHTML = '';
    },

    unlockAudio() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!this.audioCtx) this.audioCtx = new Ctx();
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        } catch (error) {
            // No audio: the notification and vibration still work
        }
    },

    /**
     * Three short beeps (no audio file needed)
     */
    beep() {
        const ctx = this.audioCtx;
        if (!ctx) return;
        try {
            for (let i = 0; i < 3; i++) {
                const start = ctx.currentTime + i * 0.35;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.frequency.value = 880;
                gain.gain.setValueAtTime(0.25, start);
                gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
                osc.connect(gain).connect(ctx.destination);
                osc.start(start);
                osc.stop(start + 0.25);
            }
        } catch (error) {
            console.error('Error playing alert sound:', error);
        }
    },

    /**
     * Keep the screen on so the page (and its timers) stay alive
     * @param {boolean} on
     */
    setWakeLock(on) {
        this.wantWakeLock = on;
        if (on) {
            this.requestWakeLock();
        } else if (this.wakeLock) {
            this.wakeLock.release().catch(() => {});
            this.wakeLock = null;
        }
    },

    async requestWakeLock() {
        if (!('wakeLock' in navigator)) return;
        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            // Released by the browser when the page is hidden; re-acquired on visibilitychange
            this.wakeLock.addEventListener('release', () => {
                this.wakeLock = null;
            });
        } catch (error) {
            console.error('Wake lock failed:', error);
            this.wakeLock = null;
        }
    },

    /**
     * Render the "Alertas ativos" bar
     */
    renderBar() {
        const bar = document.getElementById('alertsBar');
        const alerts = Storage.getAlerts();

        if (alerts.length === 0) {
            bar.innerHTML = '';
            bar.style.display = 'none';
            return;
        }

        const chips = alerts.map(alert => {
            const due = this.nextDue[alert.id];
            const status = due === undefined
                ? 'a verificar…'
                : due === null ? 'sem autocarro a caminho' : `próximo a ${due} min`;

            return `
                <div class="alert-chip">
                    <button type="button" class="alert-chip-main" data-open-stop="${App.escapeHTML(alert.stopId)}">
                        🔔 <span class="badge" style="background-color: #${App.escapeHTML(alert.routeColor)}">${App.escapeHTML(alert.routeShort)}</span>
                        <span class="alert-chip-stop">${App.escapeHTML(alert.stopName)}</span>
                        <span class="text-muted">· ${alert.minutes} min · ${status}</span>
                    </button>
                    <button type="button" class="btn-close alert-chip-remove" data-remove-alert="${App.escapeHTML(alert.id)}" aria-label="Cancelar alerta"></button>
                </div>
            `;
        }).join('');

        const wakeLockSwitch = 'wakeLock' in navigator ? `
            <div class="form-check form-switch small mb-0 mt-1">
                <input class="form-check-input" type="checkbox" role="switch" id="wakeLockSwitch" ${this.wantWakeLock ? 'checked' : ''}>
                <label class="form-check-label text-muted" for="wakeLockSwitch">Manter ecrã ligado</label>
            </div>
        ` : '';

        bar.innerHTML = `
            <div class="alerts-bar">
                <div class="alerts-bar-title">Alertas ativos</div>
                ${chips}
                ${wakeLockSwitch}
            </div>
        `;
        bar.style.display = 'block';
    },

    loadLastMinutes() {
        try {
            const saved = parseInt(localStorage.getItem(this.LAST_MINUTES_KEY), 10);
            if (this.MINUTE_CHOICES.includes(saved)) return saved;
        } catch (error) {
            // Storage unavailable
        }
        return this.DEFAULT_MINUTES;
    },

    saveLastMinutes(minutes) {
        try {
            localStorage.setItem(this.LAST_MINUTES_KEY, String(minutes));
        } catch (error) {
            // Storage unavailable: ignore
        }
    }
};

window.Alerts = Alerts;
