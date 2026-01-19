import { HA_HTTP_URL } from '/local/js/config.js';
import { callService, subscribe, initApi, isConnected } from '/local/js/api.js';
import { entityHandlers } from '/local/js/entity_handlers.js';

// --- Variabili Globali ---
let entities = {};
let activeModalEntityId = null;
let dashboardConfig = {};
let isInitialStatesLoaded = false;
let isEditMode = false;
let activeViewId = null;
let currentEdit = {}; // { viewIndex, roomIndex, cardIndex }
let isSaving = false;
let clockInterval = null;
// Dichiarazione delle variabili per i selettori delle modali
let viewConfigModal, viewConfigForm, roomConfigModal, roomConfigForm, 
    entityConfigModal, entityConfigForm, cardTypeSelect, cardConfigFields;
// ========================================================================
// GESTIONE CONFIGURAZIONE PERSISTENTE
// ========================================================================

function translateWeatherState(state) {
    const translations = {'clear-night':'Sereno','cloudy':'Nuvoloso','exceptional':'Condizioni Eccezionali','fog':'Nebbia','hail':'Grandine','lightning':'Fulmini','lightning-rainy':'Temporale','partlycloudy':'Parz. Nuvoloso','pouring':'Rovescio','rainy':'Piovoso','snowy':'Neve','snowy-rainy':'Nevischio','sunny':'Soleggiato','windy':'Ventoso','windy-variant':'Ventoso'};
    return translations[state] || state.charAt(0).toUpperCase() + state.slice(1);
}

function getWeatherIcon(state) {
    const icons = {'clear-night':'moon','cloudy':'cloud','fog':'cloud-fog','hail':'cloud-hail','lightning':'zap','lightning-rainy':'cloud-lightning','partlycloudy':'cloud-sun','pouring':'cloud-drizzle','rainy':'cloud-rain','snowy':'cloud-snow','snowy-rainy':'cloud-sleet','sunny':'sun','windy':'wind','windy-variant':'wind'};
    return icons[state] || 'thermometer-sun';
}


function initializeDefaultConfig() {
    dashboardConfig = {
        sidebar_widgets: [],
        views: [
            { id: 'panoramica', name: 'Panoramica', icon: 'layout-dashboard', layout: 'grid', cards: [] },
            { id: 'stanze', name: 'Stanze', icon: 'sofa', layout: 'tabs', rooms: [] }
        ]
    };
}

// In /js/ui.js, sostituisci queste due funzioni

async function loadDashboardConfig() {
    try {
        const response = await fetch('/local/dashboard_config.json?t=' + new Date().getTime());
        
        // Se il file non esiste (errore 404), inizializza la config di default.
        if (!response.ok) {
            console.log("File di configurazione non trovato. Inizializzo default.");
            initializeDefaultConfig();
            renderApp();
            return;
        }
        
        // Leggi il contenuto come testo
        const configText = await response.text();
        
        // Se il file esiste ma è vuoto, inizializza la config di default.
        if (!configText) {
            console.log("File di configurazione trovato ma vuoto. Inizializzo default.");
            initializeDefaultConfig();
            renderApp();
            return;
        }

        // Solo se abbiamo del testo, proviamo a interpretarlo come JSON.
        const loadedData = JSON.parse(configText);
        
        if (Array.isArray(loadedData)) { // Logica di Migrazione
            console.warn("Rilevata configurazione obsoleta. Migrazione in corso...");
            dashboardConfig = {
                sidebar_widgets: [],
                views: [
                    { id: 'panoramica', name: 'Panoramica', icon: 'layout-dashboard', layout: 'grid', cards: [] },
                    { id: 'stanze', name: 'Stanze', icon: 'sofa', layout: 'tabs', rooms: loadedData.map(room => ({...room, cards: room.entities || []})) },
                ]
            };
            saveDashboardConfig(); // Salva e ricarica
            return; 
        } else {
            dashboardConfig = loadedData;
            console.log("Configurazione caricata da file.");
        }

    } catch (e) {
        console.error("Errore critico nel caricamento o parsing della configurazione. Inizializzo default.", e);
        initializeDefaultConfig();
    }

    // Assicurati che le chiavi principali esistano sempre
    if (!dashboardConfig.views) dashboardConfig.views = [];
    if (!dashboardConfig.sidebar_widgets) dashboardConfig.sidebar_widgets = [];

    if (!activeViewId || !dashboardConfig.views.find(v => v.id === activeViewId)) {
        activeViewId = dashboardConfig.views.length > 0 ? dashboardConfig.views[0].id : null;
    }
    
    renderApp();
}


function saveDashboardConfig() {
    console.log("Salvataggio configurazione via Componente Custom...");
    isSaving = true;

    // Pulisce la configurazione da chiavi obsolete prima di salvare
    (dashboardConfig.views || []).forEach(view => {
        if(view.layout === 'tabs' && view.rooms) {
            view.rooms.forEach(room => delete room.entities);
        }
    });
    
    // Converte l'oggetto in JSON formattato per una migliore leggibilità nel file
    const jsonConfig = JSON.stringify(dashboardConfig, null, 2);

    // Chiama il nostro servizio custom "dashboard_saver.save_config"
    callService('dashboard_saver', 'save_config', {
        content: jsonConfig
    });

    // Ridisegna subito l'interfaccia per mostrare le modifiche
    renderApp();
    
    // Resetta il flag di salvataggio dopo un breve ritardo per ignorare l'eco
    setTimeout(() => { isSaving = false; }, 1500);
}

// ========================================================================
// MOTORE DI RENDERING
// ========================================================================

function renderApp() {
    renderNavigation();
    renderCurrentView();
    updateConnectionStatus(isConnected());
}

function renderNavigation() {
    const navContainer = document.getElementById('main-nav');
    if (!navContainer) return;
    navContainer.innerHTML = '';

    (dashboardConfig.views || []).forEach((view, viewIndex) => {
        const isActive = view.id === activeViewId;
        const navWrapper = document.createElement('div');
        navWrapper.className = 'relative';
        navWrapper.innerHTML = `
            <a href="#" class="nav-item flex flex-col items-center p-3 rounded-lg ${isActive ? 'active' : ''}">
                <i data-lucide="${view.icon}" class="w-7 h-7"></i>
                <span class="text-xs mt-1">${view.name}</span>
            </a>
            <div class="edit-control absolute -top-1 -right-1 space-x-1">
                <button onclick="openViewConfigModal(${viewIndex})" class="p-1 bg-slate-700 rounded-full"><i data-lucide="pencil" class="w-3 h-3"></i></button>
                <button onclick="deleteView(${viewIndex})" class="p-1 bg-red-800 rounded-full"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </div>`;
        navWrapper.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            if(!isEditMode) setActiveView(view.id);
        });
        navContainer.appendChild(navWrapper);
    });
    
    const addViewBtn = document.createElement('div');
    addViewBtn.className = 'edit-control pt-4';
    addViewBtn.innerHTML = `<button onclick="openViewConfigModal()" class="p-2 rounded-full text-slate-400 hover:text-white"><i data-lucide="plus-circle"></i></button>`;
    navContainer.appendChild(addViewBtn);

    lucide.createIcons();
}

function setActiveView(viewId) {
    activeViewId = viewId;
    renderApp();
}

function renderCurrentView() {
    const mainContainer = document.querySelector('main');
    if (!mainContainer) return;
    mainContainer.innerHTML = ''; 

    const view = (dashboardConfig.views || []).find(v => v.id === activeViewId);
    
    const header = document.createElement('header');
    header.className = 'flex justify-between items-center mb-8';
    header.innerHTML = `
        <div>
            <h1 class="text-4xl font-bold text-white">${view ? view.name : 'Dashboard'}</h1>
            ${!view ? '<p class="text-slate-400 mt-2">Nessuna vista trovata. Entra in modalità modifica per iniziare.</p>' : ''}
        </div>
        <button id="edit-mode-btn" class="remote-btn p-3 rounded-full" style="display: none;">
            <i data-lucide="edit"></i>
        </button>
    `;
    mainContainer.appendChild(header);
    
    const editModeBtn = document.getElementById('edit-mode-btn');
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('modifica') === 'true') {
        if (editModeBtn) {
            editModeBtn.style.display = 'flex';
            editModeBtn.classList.toggle('active', isEditMode);
            editModeBtn.addEventListener('click', () => {
                isEditMode = !isEditMode;
                renderApp();
            });
        }
    }

    if (!view) {
        lucide.createIcons();
        document.body.classList.toggle('edit-mode', isEditMode);
	document.body.classList.toggle('view-mode', !isEditMode);
        return;
    }

    if (view.layout === 'tabs') {
        renderTabsView(mainContainer, view);
    } else {
        renderGridView(mainContainer, view);
    }
    
    lucide.createIcons();
    document.body.classList.toggle('edit-mode', isEditMode);
    document.body.classList.toggle('view-mode', !isEditMode);
    Object.values(entities).forEach(entity => updateEntityUI(entity));
    startClock();
}

function renderGridView(container, view) {
    const viewIndex = dashboardConfig.views.findIndex(v => v.id === view.id);
    
    // Raggruppiamo le card per tipo di layout
    const largeCards = (view.cards || []).filter(c => ['welcome', 'quick_actions'].includes(c.type));
    const normalCards = (view.cards || []).filter(c => !largeCards.includes(c));

    let contentHTML = '<div class="space-y-6">';

    // 1. Renderizza le card grandi (se presenti) in una loro griglia
    if (largeCards.length > 0) {
        contentHTML += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';
        largeCards.forEach(card => {
            const originalIndex = (view.cards || []).findIndex(c => c === card);
            if (card.type === 'welcome') {
                contentHTML += generateWelcomeCardHTML(card, viewIndex, null, originalIndex);
            } else if (card.type === 'quick_actions') {
                contentHTML += generateQuickActionsCardHTML(card, viewIndex, null, originalIndex);
            }
        });
        contentHTML += '</div>';
    }

    // 2. Renderizza la griglia delle card normali
    contentHTML += '<div class="entity-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">';
    normalCards.forEach(card => {
        const originalIndex = (view.cards || []).findIndex(c => c === card);
        if (card.type === 'weather') {
             contentHTML += generateWeatherCardHTML(card, viewIndex, null, originalIndex);
        } else { // 'entity' o default
            contentHTML += generateEntityCardHTML(card, viewIndex, null, originalIndex);
        }
    });
    contentHTML += `<div class="edit-control items-center justify-center"><button onclick="openEntityConfigModal(${viewIndex})" class="main-card w-full h-full p-4 flex flex-col items-center justify-center text-slate-400 hover:text-white border-dashed border-2 border-slate-700 hover:border-slate-500"><i data-lucide="plus" class="w-8 h-8"></i><span>Aggiungi Card</span></button></div>`;
    contentHTML += '</div>'; // Chiusura griglia normale

    contentHTML += '</div>'; // Chiusura contenitore principale
    
    container.insertAdjacentHTML('beforeend', contentHTML);
}

function renderTabsView(container, view) {
    const viewIndex = dashboardConfig.views.findIndex(v => v.id === view.id);
    const navContainer = document.createElement('div');
    navContainer.id = 'rooms-nav';
    navContainer.className = 'flex items-center flex-wrap gap-2 mb-6';
    
    const contentContainer = document.createElement('div');
    contentContainer.id = 'rooms-content';

    container.appendChild(navContainer);
    container.appendChild(contentContainer);
    
    (view.rooms || []).forEach((room, roomIndex) => {
        const tabWrapper = document.createElement('div');
        tabWrapper.className = 'relative';
        tabWrapper.innerHTML = `
            <button class="room-tab font-semibold px-4 py-2 rounded-lg" data-room-id="${room.id}">${room.name}</button>
            <div class="edit-control absolute -top-2 -right-2 space-x-1">
                <button onclick="openRoomConfigModal(${viewIndex}, ${roomIndex})" class="p-1 bg-slate-700 rounded-full"><i data-lucide="pencil" class="w-3 h-3"></i></button>
                <button onclick="deleteRoom(${viewIndex}, ${roomIndex})" class="p-1 bg-red-800 rounded-full"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </div>`;
        navContainer.appendChild(tabWrapper);

        const content = document.createElement('div');
        content.id = `room-${room.id}`;
        content.className = 'room-content hidden';
        let cardsHTML = '<div class="entity-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">';
        (room.cards || []).forEach((card, cardIndex) => {
             cardsHTML += generateEntityCardHTML(card, viewIndex, roomIndex, cardIndex);
        });
        cardsHTML += `<div class="edit-control items-center justify-center"><button onclick="openEntityConfigModal(${viewIndex}, ${roomIndex})" class="main-card w-full h-full p-4 flex flex-col items-center justify-center text-slate-400 hover:text-white border-dashed border-2 border-slate-700 hover:border-slate-500"><i data-lucide="plus" class="w-8 h-8"></i><span>Aggiungi Dispositivo</span></button></div>`;
        cardsHTML += '</div>';
        content.innerHTML = cardsHTML;
        contentContainer.appendChild(content);
    });
    
    const addRoomBtn = document.createElement('div');
    addRoomBtn.className = 'edit-control';
    addRoomBtn.innerHTML = `<button onclick="openRoomConfigModal(${viewIndex})" class="p-2 ml-2 rounded-full text-slate-400 hover:text-white"><i data-lucide="plus-circle"></i></button>`;
    navContainer.appendChild(addRoomBtn);
    
    const tabs = navContainer.querySelectorAll('.room-tab');
    if (tabs.length > 0) {
        tabs[0].classList.add('active');
        contentContainer.querySelector('.room-content').classList.remove('hidden');
    }
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
document.body.setAttribute('data-room', room.id);
            contentContainer.querySelectorAll('.room-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`room-${tab.dataset.roomId}`).classList.remove('hidden');
        });
    });
}

function supportsAdvancedEntity(entity) {
    if (!entity) return false;
    const domain = entity.entity_id.split('.')[0];
    if (domain === 'light') {
        const modes = entity.attributes.supported_color_modes || [];
        return modes.some(mode => ['rgb', 'hs', 'xy', 'color_temp'].includes(mode));
    }
    return false;
}

function getDefaultCardSize(cardId) {
    const domain = cardId ? cardId.split('.')[0] : '';
    if (domain === 'camera') return 'large';
    if (domain === 'switch') return 'compact';
    return 'standard';
}

function findCardConfig(entityId) {
    for (const view of dashboardConfig.views) {
        if (view.layout === 'tabs' && view.rooms) {
            for (const room of view.rooms) {
                const found = (room.cards || []).find(c => c.id === entityId);
                if (found) return found;
            }
        } else if (view.cards) {
            const found = view.cards.find(c => c.id === entityId);
            if (found) return found;
        }
    }
    return null;
}

// In ui.js, sostituisci questa funzione

function generateEntityCardHTML(card, viewIndex, roomIndex, cardIndex) {
    const domain = card.id.split('.')[0];
    const handler = entityHandlers[domain];
    const entity = entities[card.id];
    const hasAdvancedSupport = supportsAdvancedEntity(entity);
    const allowAdvanced = card.advanced_controls ?? hasAdvancedSupport;
    const canOpenModal = handler && handler.createModalControls && allowAdvanced;
    const hasToggle = ['light', 'switch', 'media_player', 'climate'].includes(domain);
    const sizeClass = `card-size-${card.size || getDefaultCardSize(card.id)}`;
    const editParams = `${viewIndex}, ${roomIndex === null ? 'null' : roomIndex}, ${cardIndex}`;
    
    return `
        <div class="main-card relative ${sizeClass}" data-entity-id="${card.id}">
            <div class="edit-control absolute top-2 right-2 space-x-1 z-10">
                <button onclick="openEntityConfigModal(${editParams})" class="p-1 bg-slate-700 rounded-full"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="deleteEntity(${editParams})" class="p-1 bg-red-800 rounded-full"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
            <div class="card-body ${canOpenModal && !isEditMode ? 'cursor-pointer' : ''}" ${canOpenModal ? `data-entity-id-modal="${card.id}"` : ''}>
                <div class="card-status-strip">
                    ${generateIconHTML(card.icon, 'w-6 h-6')}
                </div>
                <div class="card-content-area">
                    <div class="text-content">
                        <p class="font-semibold text-white">${card.name}</p>
                        <p class="text-sm text-slate-400" data-state>...</p>
                    </div>
                    ${hasToggle ? `<div class="content-toggle"><label class="toggle-switch"><input type="checkbox" data-entity-id-toggle="${card.id}"><span class="slider"></span></label></div>` : ''}
                </div>
            </div>
        </div>`;
}


// NUOVE FUNZIONI DA AGGIUNGERE

function generateWelcomeCardHTML(card, viewIndex, roomIndex, cardIndex) {
    const editParams = `${viewIndex}, ${roomIndex === null ? 'null' : roomIndex}, ${cardIndex}`;
    return `
        <div class="main-card p-8 flex justify-between items-center relative">
             <div class="edit-control absolute top-2 right-2 z-10">
                <button onclick="openEntityConfigModal(${editParams})" class="p-1 bg-slate-700 rounded-full"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="deleteEntity(${editParams})" class="p-1 bg-red-800 rounded-full"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
            <div>
                <p class="text-xl text-slate-300">${card.title || 'Benvenuto!'}</p>
                <h2 class="text-5xl font-extrabold text-white" data-entity-id="person.user" data-state>Utente</h2>
                <p id="current-date" class="text-sm text-slate-400 mt-2">--</p>
            </div>
            <p id="current-time" class="text-7xl font-bold text-white">--:--</p>
        </div>
    `;
}

function generateQuickActionsCardHTML(card, viewIndex, roomIndex, cardIndex) {
    const editParams = `${viewIndex}, ${roomIndex === null ? 'null' : roomIndex}, ${cardIndex}`;
    let buttonsHTML = '';
    const actionIcons = { scene: 'film', script: 'file-terminal' };

    (card.entities || []).forEach((entityId, index) => {
        const entity = entities[entityId];
        const name = entity ? entity.attributes.friendly_name : entityId.split('.')[1];
        const domain = entityId.split('.')[0];
        const icon = (entity && entity.attributes.icon) ? entity.attributes.icon.replace('mdi:', '') : (actionIcons[domain] || 'zap');
        
        buttonsHTML += `
            <button class="remote-btn p-4 flex flex-col items-center gap-2" onclick="callService('${domain}', 'turn_on', { entity_id: '${entityId}' })">
                <i data-lucide="${icon}" class="w-8 h-8"></i>
                <span>${name}</span>
            </button>
        `;
    });

    return `
        <div class="main-card p-6 relative">
            <div class="edit-control absolute top-2 right-2 space-x-1 z-10">
                <button onclick="openEntityConfigModal(${editParams})" class="p-1 bg-slate-700 rounded-full"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="deleteEntity(${editParams})" class="p-1 bg-red-800 rounded-full"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
            <h3 class="text-lg font-semibold text-white mb-4">${card.title || 'Azioni Rapide'}</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                ${buttonsHTML}
            </div>
        </div>
    `;
}

function generateWeatherCardHTML(card, viewIndex, roomIndex, cardIndex) {
    const editParams = `${viewIndex}, ${roomIndex === null ? 'null' : roomIndex}, ${cardIndex}`;
    return `
        <div class="main-card p-6 flex flex-col justify-between relative" data-entity-id="${card.id}">
            <div class="edit-control absolute top-2 right-2 space-x-1 z-10">
                <button onclick="openEntityConfigModal(${editParams})" class="p-1 bg-slate-700 rounded-full"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="deleteEntity(${editParams})" class="p-1 bg-red-800 rounded-full"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
            <div class="flex justify-between items-start mb-4">
                <div>
                    <p class="font-semibold text-white" data-location>Meteo</p>
                    <p class="text-slate-400" data-state>Caricamento...</p>
                </div>
                <i data-lucide="sun" class="w-10 h-10" data-icon></i>
            </div>
            <p class="text-6xl font-bold text-white text-center" data-temperature>--<span class="text-3xl align-top">&deg;C</span></p>
        </div>
    `;
}


// In /js/ui.js, sostituisci solo questa funzione

// In /js/ui.js, sostituisci solo questa funzione

function renderCardConfigFields(cardType, cardData = null) {
    cardConfigFields.innerHTML = '';
    let fieldsHTML = '';

    // Funzione di aiuto che ora accetta un array di filtri
    const createEntityOptions = (selectedValue = '', filter = []) => {
        const filters = Array.isArray(filter) ? filter : [filter];
        
        let options = Object.keys(entities)
            .filter(id => {
                if (filters.length === 0 || (filters.length === 1 && filters[0] === '')) {
                    return true;
                }
                return filters.some(f => id.startsWith(f));
            })
            .sort()
            .map(id => `<option value="${id}" ${selectedValue === id ? 'selected' : ''}>${entities[id].attributes.friendly_name || id}</option>`)
            .join('');
        return options;
    };

    switch(cardType) {
        case 'welcome':
            fieldsHTML = `<div><label class="font-medium text-white">Titolo</label><input name="title" type="text" class="w-full p-2 mt-1 rounded-lg bg-slate-700" value="${cardData?.title || 'Benvenuto a casa!'}"></div>`;
            break;

        case 'quick_actions':
            fieldsHTML = `<div><label class="font-medium text-white">Titolo</label><input name="title" type="text" class="w-full p-2 mt-1 rounded-lg bg-slate-700" value="${cardData?.title || 'Azioni Rapide'}"></div>`;
            for (let i = 0; i < 4; i++) {
                // CORREZIONE CHIAVE: Ora passiamo un array per filtrare sia scene che script
                fieldsHTML += `<div>
                    <label class="font-medium text-white">Azione ${i + 1}</label>
                    <select name="entity_${i}" class="w-full p-2 mt-1 rounded-lg bg-slate-700">
                        <option value="">-- Seleziona --</option>
                        ${createEntityOptions(cardData?.entities?.[i], ['scene.', 'script.'])}
                    </select>
                </div>`;
            }
            break;

        case 'weather':
            fieldsHTML = `<div>
                <label class="font-medium text-white">Entità Meteo</label>
                <select name="id" class="w-full p-2 mt-1 rounded-lg bg-slate-700" required>
                    ${createEntityOptions(cardData?.id, 'weather.')}
                </select>
            </div>`;
            break;

        case 'entity':
        default:
            const selectedEntityId = cardData?.id || '';
            const defaultSize = cardData?.size || getDefaultCardSize(selectedEntityId);
            const defaultAdvanced = cardData?.advanced_controls ?? supportsAdvancedEntity(entities[selectedEntityId]);
            fieldsHTML = `
                <div>
                    <label class="font-medium text-white">Dispositivo</label>
                    <input id="entity-id-search" type="text" placeholder="Cerca..." class="w-full p-2 mt-1 rounded-lg bg-slate-700">
                    <select name="id" class="w-full p-2 mt-1 rounded-lg bg-slate-700" size="8" required>
                        ${createEntityOptions(cardData?.id)}
                    </select>
                </div>
                <div><label class="font-medium text-white">Nome Visualizzato</label><input name="name" type="text" class="w-full p-2 mt-1 rounded-lg bg-slate-700" value="${cardData?.name || ''}" required></div>
                <div><label class="font-medium text-white">Icona</label><input name="icon" type="text" class="w-full p-2 mt-1 rounded-lg bg-slate-700" value="${cardData?.icon || ''}" required></div>
                <div>
                    <label class="font-medium text-white">Dimensione Card</label>
                    <select name="size" class="w-full p-2 mt-1 rounded-lg bg-slate-700">
                        <option value="compact" ${defaultSize === 'compact' ? 'selected' : ''}>Compatta</option>
                        <option value="standard" ${defaultSize === 'standard' ? 'selected' : ''}>Standard</option>
                        <option value="large" ${defaultSize === 'large' ? 'selected' : ''}>Grande (quadrata)</option>
                    </select>
                </div>
                <div>
                    <label class="font-medium text-white">Controlli avanzati</label>
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-sm text-slate-400">Apri la modale per controlli avanzati</span>
                        <label class="toggle-switch">
                            <input type="checkbox" name="advanced_controls" ${defaultAdvanced ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            `;
            break;
    }
    cardConfigFields.innerHTML = fieldsHTML;

    const searchInput = cardConfigFields.querySelector('#entity-id-search');
    if (searchInput) {
        const select = cardConfigFields.querySelector('select[name="id"]');
        searchInput.addEventListener('input', () => {
            const filter = searchInput.value.toLowerCase();
            Array.from(select.options).forEach(option => {
                option.style.display = option.textContent.toLowerCase().includes(filter) ? '' : 'none';
            });
        });

        select.addEventListener('change', () => {
            const sizeSelect = cardConfigFields.querySelector('select[name="size"]');
            const advancedToggle = cardConfigFields.querySelector('input[name="advanced_controls"]');
            const selectedId = select.value;
            if (sizeSelect) sizeSelect.value = getDefaultCardSize(selectedId);
            if (advancedToggle) advancedToggle.checked = supportsAdvancedEntity(entities[selectedId]);
        });
    }
}

// ========================================================================
// FUNZIONI DI MODIFICA E MODALI
// ========================================================================


const entityIdSelect = document.getElementById('entity-id-select');
const entityIdSearch = document.getElementById('entity-id-search');

window.openViewConfigModal = (viewIndex = null) => {
    currentEdit = { viewIndex, roomIndex: null, cardIndex: null };
    const title = viewConfigModal.querySelector('h3');
    if (viewIndex !== null) {
        title.textContent = 'Modifica Vista';
        const view = dashboardConfig.views[viewIndex];
        viewConfigForm.querySelector('#view-name-input').value = view.name;
        viewConfigForm.querySelector('#view-icon-input').value = view.icon;
        viewConfigForm.querySelector('#view-layout-select').value = view.layout || 'grid';
    } else {
        title.textContent = 'Aggiungi Vista';
        viewConfigForm.reset();
    }
    viewConfigModal.classList.remove('hidden');
};

window.deleteView = (viewIndex) => {
    const viewName = dashboardConfig.views[viewIndex].name;
    if (confirm(`Sei sicuro di voler eliminare la vista "${viewName}"?`)) {
        dashboardConfig.views.splice(viewIndex, 1);
        saveDashboardConfig();
    }
};

window.openRoomConfigModal = (viewIndex, roomIndex = null) => {
    currentEdit = { viewIndex, roomIndex, cardIndex: null };
    if (roomIndex !== null) {
        roomConfigForm.querySelector('#room-name-input').value = dashboardConfig.views[viewIndex].rooms[roomIndex].name;
    } else {
        roomConfigForm.reset();
    }
    roomConfigModal.classList.remove('hidden');
};

window.deleteRoom = (viewIndex, roomIndex) => {
    const roomName = dashboardConfig.views[viewIndex].rooms[roomIndex].name;
    if (confirm(`Sei sicuro di voler eliminare la stanza "${roomName}"?`)) {
        dashboardConfig.views[viewIndex].rooms.splice(roomIndex, 1);
        saveDashboardConfig();
    }
};

// In ui.js, SOSTITUISCI QUESTA FUNZIONE

window.openEntityConfigModal = (viewIndex, roomIndex = null, cardIndex = null) => {
    currentEdit = { viewIndex, roomIndex, cardIndex };
    const title = entityConfigModal.querySelector('h3');
    entityConfigForm.reset();
    cardTypeSelect.disabled = false;

    if (cardIndex !== null) { // Modalità Modifica
        title.textContent = 'Modifica Card';
        let card = roomIndex !== null
            ? dashboardConfig.views[viewIndex].rooms[roomIndex].cards[cardIndex]
            : dashboardConfig.views[viewIndex].cards[cardIndex];
        cardTypeSelect.value = card.type;
        renderCardConfigFields(card.type, card);
        cardTypeSelect.disabled = true; // Non si può cambiare il tipo di una card esistente
    } else { // Modalità Aggiunta
        title.textContent = 'Aggiungi Card';
        cardTypeSelect.value = 'entity';
        renderCardConfigFields('entity');
    }
    
    entityConfigModal.classList.remove('hidden');
};

window.deleteEntity = (viewIndex, roomIndex, cardIndex) => {
    if (confirm(`Sei sicuro di voler eliminare questa card?`)) {
        if (roomIndex !== null) {
            dashboardConfig.views[viewIndex].rooms[roomIndex].cards.splice(cardIndex, 1);
        } else {
            dashboardConfig.views[viewIndex].cards.splice(cardIndex, 1);
        }
        saveDashboardConfig();
    }
};


// ========================================================================
// FUNZIONI DI UTILITÀ E GESTIONE EVENTI
// ========================================================================
function startClock() {
    if (clockInterval) clearInterval(clockInterval);

    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
    const topbarTimeEl = document.getElementById('topbar-time');
    const topbarDateEl = document.getElementById('topbar-date');

    if (timeEl || dateEl || topbarTimeEl || topbarDateEl) {
        const updateClock = () => {
            const now = new Date();
            const formattedTime = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            const formattedDate = now.toLocaleDateString('it-IT', { weekday: 'long', month: 'long', day: 'numeric' });
            if (timeEl) timeEl.textContent = formattedTime;
            if (dateEl) dateEl.textContent = formattedDate;
            if (topbarTimeEl) topbarTimeEl.textContent = formattedTime;
            if (topbarDateEl) topbarDateEl.textContent = formattedDate;
        };
        updateClock();
        clockInterval = setInterval(updateClock, 1000);
    }
}

function updateConnectionStatus(isConnected, text) {
    const statusEl = document.getElementById('connection-status');
    const topbarConnection = document.getElementById('topbar-connection');
    const topbarDot = document.querySelector('[data-topbar-dot]');
    if (!statusEl) return;
    const dot = statusEl.querySelector('.status-dot');
    const span = statusEl.querySelector('[data-status-text]');
    dot.classList.toggle('bg-green-500', isConnected);
    dot.classList.toggle('bg-red-500', !isConnected);
    span.textContent = text || (isConnected ? 'Online' : 'Offline');
    if (topbarConnection) topbarConnection.textContent = text || (isConnected ? 'Online' : 'Offline');
    if (topbarDot) {
        topbarDot.classList.toggle('bg-green-500', isConnected);
        topbarDot.classList.toggle('bg-red-500', !isConnected);
    }
}

function updateEntityUI(entity) {
    if (!entity) return;

    document.querySelectorAll(`[data-entity-id="${entity.entity_id}"]`).forEach(element => {
        const domain = entity.entity_id.split('.')[0];
        const handler = entityHandlers[domain] || entityHandlers.default;
        if (handler && handler.updateCard) {
            // CORREZIONE: Passiamo tutte le funzioni di utilità necessarie
            handler.updateCard(element, entity, { HA_HTTP_URL, translateWeatherState, getWeatherIcon });
        }
    });

    if (entity.entity_id === activeModalEntityId) {
        const domain = entity.entity_id.split('.')[0];
        const handler = entityHandlers[domain] || entityHandlers.default;
        if (handler && handler.updateModalControls) {
            handler.updateModalControls(entity);
        }
    }
}

function openEntityModal(entityId) {
    if (isEditMode) return;
    const entity = entities[entityId];
    if (!entity) return;
    const domain = entityId.split('.')[0];
    const handler = entityHandlers[domain];
    if (!handler || !handler.createModalControls) return;
    const cardConfig = findCardConfig(entityId);
    const hasAdvancedSupport = supportsAdvancedEntity(entity);
    const allowAdvanced = cardConfig?.advanced_controls ?? hasAdvancedSupport;
    if (!allowAdvanced) return;

    activeModalEntityId = entityId;
    const modal = document.getElementById('entity-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalTitle || !modalBody) return;

    modalTitle.textContent = entity.attributes.friendly_name || entityId;
    modalBody.innerHTML = '';

    handler.createModalControls(modalBody, entity, cardConfig, callService);
    if (handler.updateModalControls) {
        handler.updateModalControls(entity);
    }
    lucide.createIcons();
    modal.classList.remove('hidden');
}

function handleApiEvent(event) {
    switch (event.type) {
        case 'connection':
            if (event.state === 'connected') updateConnectionStatus(true);
            else if (event.state === 'disconnected') updateConnectionStatus(false);
            else if (event.state === 'auth_failed') updateConnectionStatus(false, 'Auth Fallita');
            break;
        case 'state_changed':
            if(event.entity) {
                if (event.entity.entity_id === 'input_text.dashboard_ui_config' && isInitialStatesLoaded) {
                    if (isSaving) {
                        console.log("Ignorando l'eco del salvataggio.");
                        return;
                    }
                    console.log("Rilevata modifica esterna della configurazione. Ricarico.");
                    loadDashboardConfig();
                } else {
                    entities[event.entity.entity_id] = event.entity;
                    if (isInitialStatesLoaded) {
                        updateEntityUI(event.entity);
                    }
                }
            }
            break;
        case 'initial_states':
            event.entities.forEach(entity => {
                if(entity) entities[entity.entity_id] = entity;
            });
            isInitialStatesLoaded = true;
            console.log("Stati iniziali ricevuti. Carico la configurazione.");
            loadDashboardConfig();
            break;
    }
}

/**
 * Genera l'HTML per un'icona, scegliendo tra Lucide e MDI.
 * @param {string} iconName - Il nome dell'icona (es. 'lightbulb' o 'mdi:lightbulb-on').
 * @param {string} classes - Le classi CSS da applicare all'icona (es. 'w-6 h-6').
 * @returns {string} La stringa HTML dell'icona.
 */
window.generateIconHTML = function(iconName, classes = '') {
    if (!iconName) return `<i class="${classes}"></i>`; // Ritorna un'icona vuota se il nome non è definito

    if (iconName.startsWith('mdi:')) {
        const mdiName = iconName.replace('mdi:', '');
        // Le icone MDI usano classi CSS, es. <span class="mdi mdi-lightbulb-on"></span>
        return `<span class="mdi mdi-${mdiName} ${classes}" style="font-size: ${classes.includes('w-8') ? '2rem' : '1.5rem'}; line-height: 1;"></span>`;
    } else {
        // Le icone Lucide usano l'attributo data-lucide
        return `<i data-lucide="${iconName}" class="${classes}"></i>`;
    }
}

// ========================================================================
// INIZIALIZZAZIONE
// ========================================================================

document.addEventListener('DOMContentLoaded', () => {

    viewConfigModal = document.getElementById('view-config-modal');
    viewConfigForm = document.getElementById('view-config-form');
    roomConfigModal = document.getElementById('room-config-modal');
    roomConfigForm = document.getElementById('room-config-form');
    entityConfigModal = document.getElementById('entity-config-modal');
    entityConfigForm = document.getElementById('entity-config-form');
    cardTypeSelect = document.getElementById('card-type-select');
    cardConfigFields = document.getElementById('card-config-fields');
    updateConnectionStatus(false, 'Connecting...');

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (mobileMenuBtn && sidebarOverlay) {
        const toggleSidebar = () => document.body.classList.toggle('sidebar-open');
        const updateSidebarState = (event) => {
            if (!event.matches) {
                document.body.classList.remove('sidebar-open');
            }
        };
        mobileMenuBtn.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', toggleSidebar);
        const mobileQuery = window.matchMedia('(max-width: 900px)');
        mobileQuery.addEventListener('change', updateSidebarState);
        updateSidebarState(mobileQuery);
    }
    
    const entityModal = document.getElementById('entity-modal');
    const entityModalCloseBtn = document.getElementById('modal-close-btn');
    if (entityModal && entityModalCloseBtn) {
        const closeEntityModal = () => {
            entityModal.classList.add('hidden');
            activeModalEntityId = null;
        };
        entityModalCloseBtn.addEventListener('click', closeEntityModal);
        entityModal.addEventListener('click', (e) => { if (e.target === entityModal) closeEntityModal(); });
    }

    if (viewConfigForm) {
        viewConfigForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const viewName = viewConfigForm.querySelector('#view-name-input').value;
            const viewIcon = viewConfigForm.querySelector('#view-icon-input').value;
            const viewLayout = viewConfigForm.querySelector('#view-layout-select').value;
            const { viewIndex } = currentEdit;
            if (viewIndex !== null && dashboardConfig.views[viewIndex]) { // Modifica
                dashboardConfig.views[viewIndex].name = viewName;
                dashboardConfig.views[viewIndex].icon = viewIcon;
                dashboardConfig.views[viewIndex].layout = viewLayout;
            } else { // Aggiunta
                const viewId = viewName.toLowerCase().replace(/\s/g, '_') + Date.now();
                const newView = { id: viewId, name: viewName, icon: viewIcon, layout: viewLayout };
                if (viewLayout === 'tabs') { newView.rooms = []; } else { newView.cards = []; }
                dashboardConfig.views.push(newView);
            }
            saveDashboardConfig();
            viewConfigModal.classList.add('hidden');
        });
    }

    if (roomConfigForm) {
        roomConfigForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const roomName = roomConfigForm.querySelector('#room-name-input').value;
            const { viewIndex, roomIndex } = currentEdit;
            const view = dashboardConfig.views[viewIndex];
            if (roomIndex !== null) { // Modifica
                view.rooms[roomIndex].name = roomName;
            } else { // Aggiunta
                const roomId = roomName.toLowerCase().replace(/\s/g, '_') + Date.now();
                if (!view.rooms) view.rooms = [];
                view.rooms.push({ id: roomId, name: roomName, cards: [] });
            }
            saveDashboardConfig();
            roomConfigModal.classList.add('hidden');
        });
    }

    if (entityConfigForm) {
        entityConfigForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const cardType = cardTypeSelect.value;
            const newCard = { type: cardType };
            
            switch(cardType) {
                case 'welcome':
                    newCard.title = cardConfigFields.querySelector('[name="title"]').value;
                    newCard.id = 'card.welcome.' + Date.now(); 
                    newCard.name = 'Welcome Card';
                    break;
                case 'quick_actions':
                    newCard.title = cardConfigFields.querySelector('[name="title"]').value;
                    newCard.entities = [];
                    for (let i = 0; i < 4; i++) {
                        const val = cardConfigFields.querySelector(`[name="entity_${i}"]`).value;
                        if (val) newCard.entities.push(val);
                    }
                    newCard.id = 'card.quick_actions.' + Date.now();
                    newCard.name = 'Quick Actions Card';
                    break;
                case 'weather':
                    newCard.id = cardConfigFields.querySelector('[name="id"]').value;
                    newCard.name = entities[newCard.id]?.attributes.friendly_name || 'Meteo';
                    newCard.icon = 'sun';
                    break;
                case 'entity':
                default:
                    newCard.id = cardConfigFields.querySelector('select[name="id"]').value;
                    newCard.name = cardConfigFields.querySelector('[name="name"]').value;
                    newCard.icon = cardConfigFields.querySelector('[name="icon"]').value;
                    newCard.size = cardConfigFields.querySelector('[name="size"]').value;
                    newCard.advanced_controls = cardConfigFields.querySelector('[name="advanced_controls"]').checked;
                    break;
            }

            const { viewIndex, roomIndex, cardIndex } = currentEdit;
            if (cardIndex !== null) { // Modifica
                if (roomIndex !== null) {
                    dashboardConfig.views[viewIndex].rooms[roomIndex].cards[cardIndex] = newCard;
                } else {
                    dashboardConfig.views[viewIndex].cards[cardIndex] = newCard;
                }
            } else { // Aggiunta
                if (roomIndex !== null) {
                    if (!dashboardConfig.views[viewIndex].rooms[roomIndex].cards) dashboardConfig.views[viewIndex].rooms[roomIndex].cards = [];
                    dashboardConfig.views[viewIndex].rooms[roomIndex].cards.push(newCard);
                } else {
                    if (!dashboardConfig.views[viewIndex].cards) dashboardConfig.views[viewIndex].cards = [];
                    dashboardConfig.views[viewIndex].cards.push(newCard);
                }
            }
            saveDashboardConfig();
            entityConfigModal.classList.add('hidden');
        });
    }

    // NUOVO: event listener per il cambio del tipo di card
    if(cardTypeSelect) {
        cardTypeSelect.addEventListener('change', () => {
            renderCardConfigFields(cardTypeSelect.value);
        });
    }

    if (entityIdSearch) {
        entityIdSearch.addEventListener('input', () => {
            const filter = entityIdSearch.value.toLowerCase();
            Array.from(entityIdSelect.options).forEach(option => {
                option.style.display = option.textContent.toLowerCase().includes(filter) ? '' : 'none';
            });
        });
    }

    document.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            if(viewConfigModal) viewConfigModal.classList.add('hidden');
            if(roomConfigModal) roomConfigModal.classList.add('hidden');
            if(entityConfigModal) entityConfigModal.classList.add('hidden');
        });
    });
    
    const mainContainer = document.querySelector('main');
    if(mainContainer){
        mainContainer.addEventListener('change', (e) => {
            const toggle = e.target.closest('input[data-entity-id-toggle]');
            if (toggle) {
                const entityId = toggle.dataset.entityIdToggle;
                const domain = entityId.split('.')[0];
                callService(domain, 'toggle', { entity_id: entityId });
            }
        });
        mainContainer.addEventListener('click', (e) => {
            const modalTrigger = e.target.closest('[data-entity-id-modal]');
            if (modalTrigger && !isEditMode) {
                openEntityModal(modalTrigger.dataset.entityIdModal);
            }
        });
    }

    subscribe(handleApiEvent);
    initApi();
});
