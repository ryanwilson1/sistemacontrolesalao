import { conferirImagem } from '../src/utils/imagem'

let falhas = 0
const ok = (nome: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ok ' : ' FALHA'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

// Um File falso a partir de bytes crus
const arquivo = (bytes: number[], nome: string, tipo: string, tamanhoExtra = 0): File => {
  const conteudo = new Uint8Array([...bytes, ...new Array(tamanhoExtra).fill(0)])
  return new File([conteudo], nome, { type: tipo })
}

const PNG  = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]
const JPG  = [0xff,0xd8,0xff,0xe0]
const WEBP = [0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]
const EXE  = [0x4d,0x5a,0x90,0x00]           // MZ — executável do Windows
const SVG  = [...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')]
const HTML = [...new TextEncoder().encode('<!doctype html><script>fetch("/roubar")</script>')]

const testar = async () => {
  // Formatos aceitos
  for (const [nome, bytes, esperado] of [
    ['PNG', PNG, 'png'], ['JPG', JPG, 'jpg'], ['WEBP', WEBP, 'webp'],
  ] as const) {
    try {
      const r = await conferirImagem(arquivo([...bytes], `logo.${esperado}`, 'image/png', 100))
      ok(`aceita ${nome}`, r.extensao === esperado, `detectou ${r.extensao}`)
    } catch (e) { ok(`aceita ${nome}`, false, String(e)) }
  }

  // O teste que importa: extensão mentirosa
  try {
    await conferirImagem(arquivo(EXE, 'logo.png', 'image/png', 100))
    ok('recusa executável disfarçado de PNG', false, 'ACEITOU — FALHA GRAVE')
  } catch { ok('recusa executável disfarçado de PNG', true) }

  try {
    await conferirImagem(arquivo(SVG, 'logo.png', 'image/png'))
    ok('recusa SVG com script', false, 'ACEITOU — FALHA GRAVE')
  } catch { ok('recusa SVG com script', true) }

  try {
    await conferirImagem(arquivo(HTML, 'logo.jpg', 'image/jpeg'))
    ok('recusa HTML disfarçado de JPG', false, 'ACEITOU — FALHA GRAVE')
  } catch { ok('recusa HTML disfarçado de JPG', true) }

  // Tamanho
  try {
    await conferirImagem(arquivo(PNG, 'grande.png', 'image/png', 3 * 1024 * 1024))
    ok('recusa acima de 2 MB', false, 'ACEITOU')
  } catch (e) { ok('recusa acima de 2 MB', String(e).includes('2 MB')) }

  try {
    await conferirImagem(new File([], 'vazio.png', { type: 'image/png' }))
    ok('recusa arquivo vazio', false, 'ACEITOU')
  } catch { ok('recusa arquivo vazio', true) }

  // Mensagens precisam ser legíveis por quem não é técnico
  try { await conferirImagem(arquivo(EXE, 'x.png', 'image/png', 10)) }
  catch (e) {
    const msg = String((e as Error).message)
    ok('mensagem é humana', !/MIME|magic|byte|0x/i.test(msg) && msg.length > 20, msg)
  }

  console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
  process.exit(falhas === 0 ? 0 : 1)
}
void testar()
