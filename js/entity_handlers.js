/**
 * ============================================================================
 * FUNZIONI DI UTILITÀ
 * ============================================================================
 */

const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

const hsToRgb = (h, s) => {
    s /= 100;
    const k = n => (n + h / 60) % 6;
    const f = n => 255 * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
    return [Math.round(f(5)), Math.round(f(3)), Math.round(f(1))];
};

const rgbToHsv = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    let d = max - min;
    s = max == 0 ? 0 : d / max;
    if (max == min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(v * 100)];
};


/**
 * ============================================================================
 * DEFINIZIONE DEGLI ENTITY HANDLERS
 * ============================================================================
 */

export const entityHandlers = {

    cover: {
        updateCard(element, entity) {
            const state = entity.state;
            const attrs = entity.attributes;
            const stateEl = element.querySelector('[data-state]');
            const iconEl = element.querySelector('[data-icon]');

            if (state === 'closed') {
                stateEl.textContent = 'Chiuso';
            } else if (state === 'open') {
                if (attrs.current_position < 100) {
                    stateEl.textContent = `Aperto al ${attrs.current_position}%`;
                } else {
                    stateEl.textContent = 'Aperto';
                }
            } else {
                stateEl.textContent = 'In movimento...';
            }

            if (iconEl) iconEl.style.color = (state !== 'closed') ? 'var(--accent-color)' : '#64748b';
        },
        createModalControls(modalBody, entity, config, callService) {
            const { attributes: attrs, entity_id: entityId } = entity;
            let sliderHTML = '';
            if (typeof attrs.current_position === 'number') {
                sliderHTML = `
                    <div class="space-y-2">
                        <label class="font-medium text-white flex justify-between"><span>Posizione</span><span data-val>${attrs.current_position}%</span></label>
                        <input type="range" id="modal-cover-position" min="0" max="100" value="${attrs.current_position}" class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer">
                    </div>
                `;
            }
            modalBody.innerHTML = `
                <div class="grid grid-cols-3 gap-4 mb-4">
                    <button data-service="open_cover" class="remote-btn p-4 flex-col gap-2"><i data-lucide="arrow-up-circle"></i>Apri</button>
                    <button data-service="stop_cover" class="remote-btn p-4 flex-col gap-2"><i data-lucide="pause-circle"></i>Stop</button>
                    <button data-service="close_cover" class="remote-btn p-4 flex-col gap-2"><i data-lucide="arrow-down-circle"></i>Chiudi</button>
                </div>
                ${sliderHTML}
            `;
            modalBody.querySelectorAll('button[data-service]').forEach(btn => {
                btn.addEventListener('click', () => callService('cover', btn.dataset.service, { entity_id: entityId }));
            });
            const positionSlider = modalBody.querySelector('#modal-cover-position');
            if (positionSlider) {
                const positionVal = modalBody.querySelector('[data-val]');
                positionSlider.addEventListener('input', () => positionVal.textContent = `${positionSlider.value}%`);
                positionSlider.addEventListener('change', () => {
                    callService('cover', 'set_cover_position', { entity_id: entityId, position: positionSlider.value });
                });
            }
        },
        updateModalControls(entity) {
            const modalBody = document.getElementById('modal-body');
            if (!modalBody) return;
            const positionSlider = modalBody.querySelector('#modal-cover-position');
            if (positionSlider && typeof entity.attributes.current_position === 'number') {
                positionSlider.value = entity.attributes.current_position;
                modalBody.querySelector('[data-val]').textContent = `${entity.attributes.current_position}%`;
            }
        }
    },

// In js/entity_handlers.js, sostituisci l'intero blocco "light: { ... }"


light: {
    updateCard(element, entity) {
        const is_on = entity.state === 'on';
        const stateEl = element.querySelector('[data-state]');
        if (stateEl) stateEl.textContent = is_on ? 'Acceso' : 'Spento';
        const toggle = element.querySelector('input[data-entity-id-toggle]');
        if (toggle) toggle.checked = is_on;
        element.classList.toggle('bg-sky-500/20', is_on);
    },

    createModalControls(modalBody, entity, config, callService) {
        const { attributes: attrs, entity_id: entityId } = entity;
        const supportedModes = attrs.supported_color_modes || [];
        const supportsTemp = supportedModes.includes('color_temp');
        const supportsColor = supportedModes.some(m => ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(m));

        modalBody.innerHTML = `<div class="flex items-center justify-between"><label class="font-medium text-white">Stato</label><label class="toggle-switch"><input type="checkbox" id="modal-toggle"><span class="slider"></span></label></div>`;
        modalBody.querySelector('#modal-toggle').addEventListener('change', () => callService('light', 'toggle', { entity_id: entityId }));
        
        if (attrs.brightness !== undefined) {
            const container = document.createElement('div');
            container.className = 'space-y-2';
            container.innerHTML = `<label class="font-medium text-white flex justify-between"><span>Luminosità</span><span data-val></span></label><input type="range" id="modal-brightness" min="1" max="100" class="w-full">`;
            modalBody.appendChild(container);
            const slider = container.querySelector('input');
            slider.addEventListener('input', () => slider.previousElementSibling.querySelector('[data-val]').textContent = `${slider.value}%`);
            slider.addEventListener('change', () => callService('light', 'turn_on', { entity_id: entityId, brightness_pct: parseInt(slider.value) }));
        }

        if (supportsTemp && supportsColor) {
            const selector = document.createElement('div');
            selector.className = 'grid grid-cols-2 gap-2 p-1 bg-slate-700 rounded-lg mode-selector';
            selector.innerHTML = `<button data-mode="color_temp" class="p-2 rounded-md font-semibold">Temperatura</button><button data-mode="color" class="p-2 rounded-md font-semibold">Colore</button>`;
            modalBody.appendChild(selector);
        }

        if (supportsTemp) {
            const container = document.createElement('div');
            container.dataset.modeContent = "color_temp";
            container.className = 'space-y-2';
            container.innerHTML = `<label class="font-medium text-white flex justify-between"><span>Temperatura Colore</span><span data-val></span></label><input type="range" id="modal-colortemp" min="${attrs.min_mireds}" max="${attrs.max_mireds}" class="w-full">`;
            modalBody.appendChild(container);
            const slider = container.querySelector('input');
            slider.addEventListener('input', () => slider.previousElementSibling.querySelector('[data-val]').textContent = `${Math.round(1000000 / slider.value)} K`);
            slider.addEventListener('change', () => callService('light', 'turn_on', { entity_id: entityId, color_temp: parseInt(slider.value) }));
        }

        if (supportsColor) {
            const container = document.createElement('div');
            container.dataset.modeContent = "color";
            container.className = 'space-y-4';
            container.innerHTML = `<div class="color-picker-sv-box rounded-lg"><div class="color-picker-cursor"></div></div><input type="range" id="modal-hue-slider" min="0" max="360" class="hue-slider w-full">`;
            modalBody.appendChild(container);
            const hueSlider = container.querySelector('#modal-hue-slider');
            const svBox = container.querySelector('.color-picker-sv-box');
            const cursor = container.querySelector('.color-picker-cursor');
            let hsv = [0, 100, 100];
            const debouncedColorChange = debounce((h, s) => { callService('light', 'turn_on', { entity_id: entityId, hs_color: [h, s] }); }, 100);
            hueSlider.addEventListener('input', () => {
                svBox.style.backgroundColor = `hsl(${hueSlider.value}, 100%, 50%)`;
                hsv[0] = parseFloat(hueSlider.value);
                debouncedColorChange(hsv[0], hsv[1]);
            });
            const handleSVMove = (e) => {
                e.preventDefault();
                const rect = svBox.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, ((e.clientX || e.touches[0].clientX) - rect.left) / rect.width));
                const y = Math.max(0, Math.min(1, ((e.clientY || e.touches[0].clientY) - rect.top) / rect.height));
                cursor.style.left = `${x * 100}%`;
                cursor.style.top = `${y * 100}%`;
                hsv[1] = x * 100;
                hsv[2] = (1 - y) * 100;
                debouncedColorChange(hsv[0], hsv[1]);
            };
            const stopSVMove = () => { document.removeEventListener('mousemove', handleSVMove); document.removeEventListener('touchmove', handleSVMove); };
            svBox.addEventListener('mousedown', (e) => { handleSVMove(e); document.addEventListener('mousemove', handleSVMove); document.addEventListener('mouseup', stopSVMove, { once: true }); });
            svBox.addEventListener('touchstart', (e) => { handleSVMove(e); document.addEventListener('touchmove', handleSVMove); document.addEventListener('touchend', stopSVMove, { once: true }); });
        }

        const modeButtons = modalBody.querySelectorAll('.mode-selector button');
        if (modeButtons.length > 0) {
            // MODIFICA CHIAVE: La logica di cambio modalità ora invia un comando
            const setActiveMode = (mode) => {
                modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
                const tempContent = modalBody.querySelector('[data-mode-content="color_temp"]');
                const colorContent = modalBody.querySelector('[data-mode-content="color"]');
                if (tempContent) tempContent.style.display = mode === 'color_temp' ? 'block' : 'none';
                if (colorContent) colorContent.style.display = mode === 'color' ? 'block' : 'none';
                
                // Invia il comando alla lampadina quando si cambia modalità
                if (mode === 'color_temp' && tempContent) {
                    const tempSlider = tempContent.querySelector('input');
                    callService('light', 'turn_on', { entity_id: entityId, color_temp: parseInt(tempSlider.value) });
                } else if (mode === 'color' && colorContent) {
                    const hueSlider = colorContent.querySelector('#modal-hue-slider');
                    const cursor = colorContent.querySelector('.color-picker-cursor');
                    const saturation = parseFloat(cursor.style.left) || 100;
                    callService('light', 'turn_on', { entity_id: entityId, hs_color: [parseFloat(hueSlider.value), saturation] });
                }
            };

            modeButtons.forEach(btn => btn.addEventListener('click', () => setActiveMode(btn.dataset.mode)));
            // Impostazione iniziale senza inviare comandi
            const currentMode = attrs.color_mode === 'color_temp' ? 'color_temp' : 'color';
            modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === currentMode));
            const tempContent = modalBody.querySelector('[data-mode-content="color_temp"]');
            const colorContent = modalBody.querySelector('[data-mode-content="color"]');
            if (tempContent) tempContent.style.display = currentMode === 'color_temp' ? 'block' : 'none';
            if (colorContent) colorContent.style.display = currentMode === 'color' ? 'block' : 'none';
        }
    },

    updateModalControls(entity) {
        const modalBody = document.getElementById('modal-body');
        if (!modalBody) return;
        const { attributes: attrs } = entity;
        const toggle = modalBody.querySelector('#modal-toggle');
        if (toggle) toggle.checked = entity.state === 'on';

        const brightnessSlider = modalBody.querySelector('#modal-brightness');
        if (brightnessSlider && attrs.brightness !== undefined) {
            const pct = Math.round((attrs.brightness / 255) * 100);
            if (document.activeElement !== brightnessSlider) brightnessSlider.value = pct;
            const valEl = brightnessSlider.previousElementSibling.querySelector('[data-val]');
            if(valEl) valEl.textContent = `${pct}%`;
        }

        const tempSlider = modalBody.querySelector('#modal-colortemp');
        // MODIFICA CHIAVE: Prevenzione dell'errore "Infinity"
        if (tempSlider) {
            if (attrs.color_mode === 'color_temp' && typeof attrs.color_temp === 'number') {
                const mireds = attrs.color_temp;
                if (document.activeElement !== tempSlider) tempSlider.value = mireds;
                const valEl = tempSlider.previousElementSibling.querySelector('[data-val]');
                if(valEl) valEl.textContent = `${Math.round(1000000 / mireds)} K`;
            } else if (!tempSlider.value) {
                // Imposta un valore di default se la luce non è in modalità temperatura
                tempSlider.value = attrs.min_mireds || 153;
            }
        }
        
        const hueSlider = modalBody.querySelector('#modal-hue-slider');
        if (hueSlider) {
            let hsv = [];
            if (attrs.color_mode !== 'color_temp' && (attrs.rgb_color || attrs.hs_color)) {
                const rgb = attrs.rgb_color || hsToRgb(attrs.hs_color[0], attrs.hs_color[1]);
                hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
                if (document.activeElement !== hueSlider) {
                    hueSlider.value = hsv[0];
                }
            }
            const svBox = modalBody.querySelector('.color-picker-sv-box');
            if (svBox) {
                svBox.style.backgroundColor = `hsl(${hueSlider.value}, 100%, 50%)`;
            }
            if (hsv.length > 0) {
                const cursor = modalBody.querySelector('.color-picker-cursor');
                if (cursor) {
                    cursor.style.left = `${hsv[1]}%`;
                    cursor.style.top = `${100 - hsv[2]}%`;
                }
            }
        }
    }
},

    switch: {
        updateCard(element, entity) {
            const is_on = entity.state === 'on';
            element.querySelector('[data-state]').textContent = is_on ? 'Acceso' : 'Spento';
            const toggle = element.querySelector('input[data-entity-id-toggle]');
            if (toggle) {
                toggle.checked = is_on;
            }
            element.classList.toggle('bg-sky-500/20', is_on);
            const iconEl = element.querySelector('[data-icon]');
            if (iconEl) {
                iconEl.style.color = is_on ? 'var(--accent-color)' : '#64748b';
            }
        }
    },

    climate: {
        hvacModeTranslations: { 'heat':'Caldo', 'cool':'Freddo', 'heat_cool':'Automatico', 'dry':'Deumidificatore', 'fan_only':'Ventilazione', 'off':'Spento' },
        hvacModeColors: { 'heat':'#F87171', 'cool':'#60A5FA', 'heat_cool':'#4ADE80', 'dry':'#FBBF24', 'fan_only':'#94A3B8', 'off':'#64748b' },
        hvacModeIcons: { 'heat':'flame', 'cool':'snowflake', 'heat_cool':'thermostat', 'dry':'droplets', 'fan_only':'fan', 'off':'power' },
        updateCard(element, entity) {
            const state = entity.state;
            const attrs = entity.attributes;
            const stateEl = element.querySelector('[data-state]');
            const iconEl = element.querySelector('[data-icon]');
            const toggle = element.querySelector('input[data-entity-id-toggle]');
            if (toggle) toggle.checked = state !== 'off';
            if (state === 'off') {
                if (typeof attrs.current_temperature === 'number' && !isNaN(attrs.current_temperature)) {
                    stateEl.textContent = `${attrs.current_temperature.toFixed(1)}°C`;
                } else {
                    stateEl.textContent = 'Spento';
                }
            } else {
                if (typeof attrs.temperature === 'number' && !isNaN(attrs.temperature)) {
                    stateEl.textContent = `Impostato a ${attrs.temperature.toFixed(1)}°`;
                } else {
                    stateEl.textContent = this.hvacModeTranslations[state] || state;
                }
            }
            if (iconEl) {
                iconEl.style.color = this.hvacModeColors[state] || this.hvacModeColors.off;
                iconEl.setAttribute('data-lucide', this.hvacModeIcons[state] || this.hvacModeIcons.off);
                lucide.createIcons({ nodes: [iconEl] });
            }
        },
        createModalControls(modalBody, entity, config, callService) {
            const { attributes: attrs, entity_id: entityId } = entity;
            const tempControlHTML = `<div class="text-center space-y-2"><p class="text-slate-400">Temperatura Corrente: <span class="font-bold text-white" data-current-temp>${attrs.current_temperature || '--'}°C</span></p><div class="flex items-center justify-center gap-4"><button data-action="temp-down" class="remote-btn p-4 rounded-full"><i data-lucide="minus"></i></button><p class="text-6xl font-bold text-white w-28" data-target-temp>${attrs.temperature || '--'}</p><button data-action="temp-up" class="remote-btn p-4 rounded-full"><i data-lucide="plus"></i></button></div></div>`;
            let modeSelectorHTML = '<div class="grid grid-cols-3 gap-2">';
            attrs.hvac_modes.forEach(mode => {
                if (mode !== 'off') {
                    modeSelectorHTML += `<button data-mode="${mode}" class="remote-btn p-2 text-sm">${this.hvacModeTranslations[mode] || mode}</button>`;
                }
            });
            modeSelectorHTML += '</div>';
            let otherControlsHTML = '';
            if (attrs.fan_modes) {
                otherControlsHTML += `<div class="space-y-2"><label class="font-medium text-white">Velocità Ventola</label><select data-control="fan_mode" class="w-full p-2 rounded-lg bg-slate-700 border-slate-600">${attrs.fan_modes.map(m => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('')}</select></div>`;
            }
            if (attrs.swing_modes) {
                otherControlsHTML += `<div class="space-y-2"><label class="font-medium text-white">Oscillazione</label><select data-control="swing_mode" class="w-full p-2 rounded-lg bg-slate-700 border-slate-600">${attrs.swing_modes.map(m => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('')}</select></div>`;
            }
            modalBody.innerHTML = `<div class="flex items-center justify-between"><label class="font-medium text-white">Stato</label><label class="toggle-switch"><input type="checkbox" id="modal-toggle"><span class="slider"></span></label></div>${tempControlHTML}<div class="space-y-2"><label class="font-medium text-white">Modalità</label>${modeSelectorHTML}</div>${otherControlsHTML}`;
            modalBody.querySelector('#modal-toggle').addEventListener('change', (e) => {
                callService('climate', e.target.checked ? 'turn_on' : 'turn_off', { entity_id: entityId });
            });
            const setTemp = debounce((newTemp) => {
                callService('climate', 'set_temperature', { entity_id: entityId, temperature: newTemp });
            }, 500);
            const updateTempUI = (newTemp) => {
                const tempEl = modalBody.querySelector('[data-target-temp]');
                if (tempEl) tempEl.textContent = newTemp.toFixed(1);
            };
            modalBody.querySelector('[data-action="temp-down"]').addEventListener('click', () => {
                const current = parseFloat(modalBody.querySelector('[data-target-temp]').textContent);
                if(isNaN(current)) return;
                const step = attrs.target_temp_step || 0.5;
                const newTemp = Math.max(attrs.min_temp, current - step);
                updateTempUI(newTemp);
                setTemp(newTemp);
            });
            modalBody.querySelector('[data-action="temp-up"]').addEventListener('click', () => {
                const current = parseFloat(modalBody.querySelector('[data-target-temp]').textContent);
                if(isNaN(current)) return;
                const step = attrs.target_temp_step || 0.5;
                const newTemp = Math.min(attrs.max_temp, current + step);
                updateTempUI(newTemp);
                setTemp(newTemp);
            });
            modalBody.querySelectorAll('[data-mode]').forEach(btn => {
                btn.addEventListener('click', () => {
                    callService('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: btn.dataset.mode });
                });
            });
            modalBody.querySelectorAll('[data-control]').forEach(select => {
                select.addEventListener('change', (e) => {
                    callService('climate', `set_${e.target.dataset.control}`, { entity_id: entityId, [e.target.dataset.control]: e.target.value });
                });
            });
        },
        updateModalControls(entity) {
            const modalBody = document.getElementById('modal-body');
            if (!modalBody) return;
            const { state, attributes: attrs } = entity;
            const toggle = modalBody.querySelector('#modal-toggle');
            if (toggle) toggle.checked = state !== 'off';
            const targetTempEl = modalBody.querySelector('[data-target-temp]');
            if (targetTempEl) {
                if (typeof attrs.temperature === 'number' && !isNaN(attrs.temperature)) {
                    targetTempEl.textContent = attrs.temperature.toFixed(1);
                } else {
                    targetTempEl.textContent = '--';
                }
            }
            const currentTempEl = modalBody.querySelector('[data-current-temp]');
            if (currentTempEl) {
                if (typeof attrs.current_temperature === 'number' && !isNaN(attrs.current_temperature)) {
                    currentTempEl.textContent = `${attrs.current_temperature}°C`;
                } else {
                    currentTempEl.textContent = '--°C';
                }
            }
            modalBody.querySelectorAll('[data-mode]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === state);
            });
            if (attrs.fan_mode && modalBody.querySelector('[data-control="fan_mode"]')) {
                modalBody.querySelector('[data-control="fan_mode"]').value = attrs.fan_mode;
            }
            if (attrs.swing_mode && modalBody.querySelector('[data-control="swing_mode"]')) {
                modalBody.querySelector('[data-control="swing_mode"]').value = attrs.swing_mode;
            }
        }
    },

    media_player: {
        updateCard(element, entity, utils) {
            const is_on = entity.state !== 'off' && entity.state !== 'unavailable';
            element.classList.toggle('bg-sky-500/20', is_on);
            const iconEl = element.querySelector('[data-icon]');
            if (iconEl) {
                iconEl.style.color = is_on ? 'var(--accent-color)' : '#64748b';
            }
            const toggle = element.querySelector('input[data-entity-id-toggle]');
            if (toggle) {
                toggle.checked = is_on;
            }
            const stateEl = element.querySelector('[data-state]');
            if (stateEl) {
                stateEl.textContent = is_on ? entity.state : 'Spento';
            }
            const titleEl = element.querySelector('[data-title]');
            if (titleEl) {
                const artistEl = element.querySelector('[data-artist]');
                const albumArtEl = element.querySelector('[data-album-art]');
                const playPauseIcon = element.querySelector('[data-play-pause-icon]');
                if (entity.state === 'playing') {
                    titleEl.textContent = entity.attributes.media_title || 'In Riproduzione';
                    if (artistEl) artistEl.textContent = entity.attributes.media_artist || '...';
                    if (albumArtEl) albumArtEl.src = entity.attributes.entity_picture ? `${utils.HA_HTTP_URL}${entity.attributes.entity_picture}` : 'https://placehold.co/96x96/1e293b/FFF?text=MEDIA';
                    if (playPauseIcon) playPauseIcon.setAttribute('data-lucide', 'pause');
                } else {
                    titleEl.textContent = is_on ? 'In Pausa' : 'Spento';
                    if (artistEl) artistEl.textContent = '...';
                    if (playPauseIcon) playPauseIcon.setAttribute('data-lucide', 'play');
                }
                lucide.createIcons({ nodes: [element] });
            }
        },
        createModalControls(modalBody, entity, config, callService) {
            const { attributes: attrs, entity_id: entityId } = entity;
            const remoteId = config ? config.remote_id : null;
            let modalHTML = `<div class="flex items-center justify-between"><label class="font-medium text-white">Stato</label><label class="toggle-switch"><input type="checkbox" id="modal-toggle"><span class="slider"></span></label></div>`;
            if (attrs.volume_level !== undefined) {
                modalHTML += `<div class="space-y-2"><label class="font-medium text-white flex justify-between"><span>Volume</span><span data-val></span></label><div class="flex items-center gap-2"><input type="range" id="modal-volume" min="0" max="100" class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"><button id="modal-mute" class="remote-btn p-2"><i data-lucide="volume-2"></i></button></div></div>`;
            }
            if (attrs.source_list && attrs.source_list.length > 0) {
                let options = attrs.source_list.map(s => `<option value="${s}">${s}</option>`).join('');
                modalHTML += `<div class="space-y-2"><label for="modal-source" class="font-medium text-white">Sorgente</label><select id="modal-source" class="w-full p-2 rounded-lg bg-slate-700 border-slate-600">${options}</select></div>`;
            }
            if (remoteId) {
                const sendRemoteCmd = (cmd) => `callService('remote', 'send_command', { entity_id: '${remoteId}', command: '${cmd}' })`;
                modalHTML += `<div><label class="font-medium text-white mb-2 block">Telecomando</label><div class="grid grid-cols-3 gap-2 mb-2"><button class="remote-btn" onclick="${sendRemoteCmd('KEY_HOME')}"><i data-lucide="home"></i></button><div></div><button class="remote-btn" onclick="${sendRemoteCmd('KEY_BACK')}"><i data-lucide="arrow-left-circle"></i></button></div><div class="d-pad aspect-square"><button class="d-pad-up" onclick="${sendRemoteCmd('KEY_UP')}"><i data-lucide="chevron-up"></i></button><button class="d-pad-left" onclick="${sendRemoteCmd('KEY_LEFT')}"><i data-lucide="chevron-left"></i></button><button class="d-pad-center" onclick="${sendRemoteCmd('KEY_ENTER')}">OK</button><button class="d-pad-right" onclick="${sendRemoteCmd('KEY_RIGHT')}"><i data-lucide="chevron-right"></i></button><button class="d-pad-down" onclick="${sendRemoteCmd('KEY_DOWN')}"><i data-lucide="chevron-down"></i></button></div></div>`;
            }
            modalBody.innerHTML = modalHTML;
            modalBody.querySelector('#modal-toggle').addEventListener('change', () => callService('media_player', 'toggle', { entity_id: entityId }));
            const volumeSlider = modalBody.querySelector('#modal-volume');
            if (volumeSlider) {
                volumeSlider.addEventListener('input', () => volumeSlider.parentElement.previousElementSibling.querySelector('[data-val]').textContent = `${volumeSlider.value}%`);
                volumeSlider.addEventListener('change', () => callService('media_player', 'volume_set', { entity_id: entityId, volume_level: parseInt(volumeSlider.value) / 100 }));
            }
            const muteBtn = modalBody.querySelector('#modal-mute');
            if (muteBtn) muteBtn.addEventListener('click', () => callService('media_player', 'volume_mute', { entity_id: entityId, is_volume_muted: !entity.attributes.is_volume_muted }));
            const sourceSelect = modalBody.querySelector('#modal-source');
            if (sourceSelect) sourceSelect.addEventListener('change', (e) => callService('media_player', 'select_source', { entity_id: entityId, source: e.target.value }));
        },
        updateModalControls(entity) {
            const toggle = document.getElementById('modal-toggle');
            if (toggle) toggle.checked = entity.state !== 'off';
            const volumeSlider = document.getElementById('modal-volume');
            if (volumeSlider && entity.attributes.volume_level !== undefined) {
                const volPct = Math.round(entity.attributes.volume_level * 100);
                if (document.activeElement !== volumeSlider) volumeSlider.value = volPct;
                volumeSlider.parentElement.previousElementSibling.querySelector('[data-val]').textContent = `${volPct}%`;
            }
            const muteBtn = document.getElementById('modal-mute');
            if (muteBtn && entity.attributes.is_volume_muted !== undefined) {
                muteBtn.classList.toggle('active', entity.attributes.is_volume_muted);
                const icon = muteBtn.querySelector('i');
                icon.setAttribute('data-lucide', entity.attributes.is_volume_muted ? 'volume-x' : 'volume-2');
                lucide.createIcons({ nodes: [icon] });
            }
            const sourceSelect = document.getElementById('modal-source');
            if (sourceSelect && entity.attributes.source) {
                sourceSelect.value = entity.attributes.source;
            }
        }
    },

    sensor: {
        updateCard(element, entity) {
            const unit = entity.attributes.unit_of_measurement || '';
            element.querySelector('[data-state]').textContent = `${entity.state} ${unit}`;
        }
    },

    binary_sensor: {
        updateCard(element, entity) {
            const stateEl = element.querySelector('[data-state]');
            const is_on = entity.state === 'on';
            stateEl.textContent = is_on ? 'Rilevato' : 'Normale';
            stateEl.classList.toggle('text-amber-400', is_on);
        }
    },

    weather: {
        updateCard(element, entity, utils) {
            const nameEl = element.querySelector('[data-location]');
            if (nameEl) nameEl.textContent = entity.attributes.friendly_name || 'Meteo';
            const tempEl = element.querySelector('[data-temperature]');
            if (tempEl) tempEl.innerHTML = `${Math.round(entity.attributes.temperature)}<span class="text-3xl align-top">&deg;C</span>`;
            const stateEl = element.querySelector('[data-state]');
            if (stateEl) stateEl.textContent = utils.translateWeatherState(entity.state);
            const iconEl = element.querySelector('[data-icon]');
            if (iconEl) {
                iconEl.setAttribute('data-lucide', utils.getWeatherIcon(entity.state));
                lucide.createIcons({ nodes: [iconEl] });
            }
        }
    },

    camera: {
        updateCard(element, entity, utils) {
            const timestamp = new Date().getTime();
            const imgEl = element.querySelector('[data-camera-feed]');
            if (imgEl) {
                imgEl.src = `${utils.HA_HTTP_URL}${entity.attributes.entity_picture}&t=${timestamp}`;
            }
        }
    },
    
    default: {
        updateCard(element, entity) {
            const stateEl = element.querySelector('[data-state]');
            if (stateEl) {
                stateEl.textContent = entity.state;
            }
        }
    }
};