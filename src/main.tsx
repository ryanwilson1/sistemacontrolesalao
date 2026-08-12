import { StrictMode } from 'react'

declare const __VERSAO_STUDIO__: string

/*
  A versão fica visível para diagnóstico: no console do navegador e em
  `window.__VERSAO_STUDIO__`. Quando um print de produção mostrar algo
  que o código não explica, a primeira pergunta — "que build é esse?" —
  passa a ter resposta imediata.
*/
;(window as Window & { __VERSAO_STUDIO__?: string }).__VERSAO_STUDIO__ = __VERSAO_STUDIO__
console.info(`System Studio ${__VERSAO_STUDIO__}`)

/*
  As duas portas por onde um erro escapa de qualquer boundary: a
  exceção síncrona fora do React e a promessa rejeitada sem catch.
  Ambas desaguam no diário — mesmo destino das falhas de renderização,
  mesma leitura no console de qualquer aparelho.
*/
import('@/services/diario-de-erros').then(({ registrarErro }) => {
  window.addEventListener('error', (evento) => {
    registrarErro({ erro: evento.error ?? evento.message })
  })
  window.addEventListener('unhandledrejection', (evento) => {
    registrarErro({ erro: evento.reason })
  })
}).catch(() => {})

import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/index.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado no index.html')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
