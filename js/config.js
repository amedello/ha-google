// /www/js/config.js

export const HA_IP = '192.168.1.109'; // Sostituisci con il tuo IP
export const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJlNmFkNWI2MzE0NTg0YWQ1YjQyNjFmYzcxYTYxOGVjOCIsImlhdCI6MTc1OTQ3NzUyNiwiZXhwIjoyMDc0ODM3NTI2fQ.yiNRJEGKkpexeE-DAotWGKhLBZw3nyKBj_AtJgSpJQQ'; // Sostituisci con il tuo Token

// URL calcolati automaticamente
export const HA_URL = `ws://${HA_IP}:8123/api/websocket`;
export const HA_HTTP_URL = `http://${HA_IP}:8123`;