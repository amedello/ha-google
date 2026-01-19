// /www/js/api.js

import { HA_URL, HA_TOKEN } from '/local/js/config.js';

let ws;
let messageId = 1;
const subscribers = new Set();

function connect() {
    console.log('Tentativo di connessione a Home Assistant...');
    ws = new WebSocket(HA_URL);

    ws.onopen = () => console.log('Connessione WebSocket aperta.');

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
            case 'auth_required':
                ws.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }));
                break;
            case 'auth_ok':
                console.log('Autenticazione riuscita!');
                subscribers.forEach(handler => handler({ type: 'connection', state: 'connected' }));
                ws.send(JSON.stringify({ id: messageId++, type: 'subscribe_events', event_type: 'state_changed' }));
                ws.send(JSON.stringify({ id: messageId++, type: 'get_states' }));
                break;
            case 'auth_invalid':
                console.error('Autenticazione fallita:', message.message);
                subscribers.forEach(handler => handler({ type: 'connection', state: 'auth_failed' }));
                ws.close();
                break;
            case 'event':
                if (message.event.event_type === 'state_changed') {
                    const entity = message.event.data.new_state;
                    if (entity) {
                        subscribers.forEach(handler => handler({ type: 'state_changed', entity }));
                    }
                }
                break;
            
            // MODIFICATO: Invia un evento unico 'initial_states' con tutte le entità
            case 'result':
                if (message.success && Array.isArray(message.result)) {
                    subscribers.forEach(handler => handler({ type: 'initial_states', entities: message.result }));
                } else if (!message.success) {
                    console.error(`Errore comando ${message.id}:`, message.error);
                }
                break;
        }
    };

    ws.onclose = () => {
        console.log('Connessione chiusa. Riconnessione tra 5s...');
        subscribers.forEach(handler => handler({ type: 'connection', state: 'disconnected' }));
        setTimeout(connect, 5000);
    };

    ws.onerror = (error) => {
        console.error('Errore WebSocket:', error);
        ws.close();
    };
}

export function callService(domain, service, serviceData) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket non connesso.');
        return;
    }
    ws.send(JSON.stringify({ id: messageId++, type: 'call_service', domain, service, service_data: serviceData }));
}

export function subscribe(handler) {
    subscribers.add(handler);
    return () => subscribers.delete(handler);
}

export function initApi() {
    connect();
}

export function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
}