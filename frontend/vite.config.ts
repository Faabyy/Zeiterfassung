import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Gemeinsame Konfiguration aus der .env im Projektverzeichnis.
  const env = loadEnv(mode, '..', '')

  // Für Tests wird kein Backend gebraucht.
  if (!env.BACKEND_PORT && mode !== 'test') {
    throw new Error('BACKEND_PORT fehlt in der .env (Vorlage: .env.example).')
  }

  return {
    plugins: [react()],
    server: {
      // Nur lokal erreichbar, nicht aus dem Netzwerk.
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${env.BACKEND_PORT}`,
          // Läuft das Backend nicht, antwortet der Proxy mit 502 statt mit
          // einem leeren 500, damit das Frontend das von echten
          // Serverfehlern unterscheiden kann.
          configure: (proxy) => {
            proxy.on('error', (_error, _request, response) => {
              if (!('writeHead' in response) || response.headersSent) {
                return
              }

              response.writeHead(502, { 'Content-Type': 'application/json' })
              response.end(
                JSON.stringify({
                  detail: 'Das Backend ist nicht erreichbar. Läuft es?',
                }),
              )
            })
          },
        },
      },
    },
  }
})
