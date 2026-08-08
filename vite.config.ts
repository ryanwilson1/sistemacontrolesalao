import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
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
