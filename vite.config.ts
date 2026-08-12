import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/*
  Carimbo de versão do build — a resposta para "qual versão está no ar?".

  O print de produção mostrou um texto que o código-fonte já não tinha:
  a única explicação é bundle antigo servido pelo cache. Sem um carimbo,
  esse diagnóstico levou uma auditoria; com ele, leva um console.log.
  Verificável em produção: `window.__VERSAO_STUDIO__` no console.
*/
const versao = `${process.env.npm_package_version ?? '0.0.0'}+${new Date()
  .toISOString()
  .replace(/[-:T]/g, '')
  .slice(0, 12)}`

export default defineConfig({
  define: {
    __VERSAO_STUDIO__: JSON.stringify(versao),
  },
  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    host: true,
  },

  build: {
    target: 'es2020',
    // Sem sourcemap em produção: publicar o mapa entrega o código original.
    sourcemap: false,
    chunkSizeWarningLimit: 700,

    rollupOptions: {
      output: {
        /**
         * Separa o que muda pouco do que muda muito. React e gráficos
         * ficam em cache no navegador entre um deploy e outro.
         */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          graficos: ['recharts'],
          animacao: ['framer-motion'],
          // O cliente do Supabase muda a cada poucos meses e o resto do
          // sistema muda toda semana. Separados, um deploy não invalida
          // o cache do outro.
          servidor: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
