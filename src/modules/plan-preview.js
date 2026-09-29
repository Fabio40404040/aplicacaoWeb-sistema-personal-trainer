// Botão "Ver prévia" do card Treinos Prontos no site.
// Se o personal marcou um treino pronto como prévia no painel, o PDF é montado
// na hora a partir dele (com a marca "PRÉVIA"). Se não houver treino marcado,
// ou a API não responder, abre o PDF fixo que já está no link.
import { fetchReadyPreview, loadPublicPreviewFrame } from './api-client.js'
import { openWorkoutPdfInTab } from './workout-pdf.js'

export function initPlanPreview() {
  document.querySelectorAll('a.plan-preview-link').forEach((link) => {
    const fallbackUrl = link.getAttribute('href')
    link.addEventListener('click', async (event) => {
      event.preventDefault()
      // Abre a aba já no clique; senão o navegador bloqueia como pop-up.
      const tab = window.open('', '_blank')
      if (tab) {
        tab.document.title = 'Prévia do treino'
        tab.document.body.style.cssText =
          'font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#475569'
        tab.document.body.textContent = 'Preparando a prévia do treino…'
      }
      try {
        const preview = await fetchReadyPreview()
        if (!preview?.exercises?.length) throw new Error('Sem prévia marcada')
        await openWorkoutPdfInTab(
          { ...preview, readyProgram: true, sitePreview: true },
          'Prévia',
          tab,
          loadPublicPreviewFrame,
        )
      } catch {
        if (tab && !tab.closed) tab.location.href = fallbackUrl
        else window.open(fallbackUrl, '_blank', 'noopener')
      }
    })
  })
}
