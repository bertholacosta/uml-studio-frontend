// Configuración en tiempo de ejecución (solo producción). Vacío = mismo dominio (/api y /collaboration).
// En Docker se genera a partir de API_URL y SOCKET_URL; en un hosting estático se puede editar a mano:
//   window.__UML_STUDIO_CONFIG__ = { apiUrl: 'https://api.midominio.com/api', socketUrl: 'https://api.midominio.com/collaboration' };
window.__UML_STUDIO_CONFIG__ = {};
