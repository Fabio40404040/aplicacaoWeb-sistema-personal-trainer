import { initAuth } from './modules/auth.js'
import { initNavigation } from './modules/router.js'
import { initDashboard } from './modules/dashboard.js'
import { initForms } from './modules/forms.js'
import { initShortcuts } from './modules/shortcuts.js'
import { initRemoteSync } from './modules/api-client.js'
import { initWebTools } from './modules/web-tools.js'
import { initPublicMenu } from './modules/public-menu.js'
import { initStudentAccess } from './modules/student-access.js'
import { initPersonalAccess } from './modules/personal-access.js'
import { initPasswordControls } from './modules/password-controls.js'
import { initPersonalTestAccess } from './modules/personal-test-access.js'
import { initCredentialSeparation } from './modules/credential-separation.js'
import { initIntegratedPortal } from './modules/integrated-portal.js'
import { initExerciseGifs } from './modules/exercise-gifs.js'
import { initPwa } from './modules/pwa.js'
import { initLogoSecret } from './modules/logo-secret.js'
import { initProgressPicker } from './modules/progress-picker.js'
import { initPersonalExtras } from './modules/personal-extras.js'
import { initCheckins } from './modules/checkins.js'
import { initAgenda } from './modules/agenda.js'
import { initAgendaSettings } from './modules/agenda-settings.js'
import { initWhatsappFloat } from './modules/whatsapp.js'
import { initExerciseHub } from './modules/exercise-hub.js'
import { initPlanPreview } from './modules/plan-preview.js'

function initialize(name, initializer) {
  try {
    const result = initializer()
    if (result && typeof result.catch === 'function')
      result.catch((error) => console.error(`Falha ao iniciar ${name}.`, error))
  } catch (error) {
    console.error(`Falha ao iniciar ${name}.`, error)
  }
}

// Os acessos ficam independentes dos demais recursos do painel. Assim, uma
// incompatibilidade em outro módulo não impede o aluno de entrar ou ver erros.
initialize('separação de credenciais', initCredentialSeparation)
initialize('controles de senha', initPasswordControls)
initialize('acesso do aluno', initStudentAccess)
initialize('acesso de teste do personal', initPersonalTestAccess)
initialize('autenticação do personal', initAuth)
initialize('navegação', initNavigation)
initialize('portal integrado', initIntegratedPortal)
initialize('biblioteca de GIFs', initExerciseGifs)
initialize('painel', initDashboard)
initialize('biblioteca unificada', initExerciseHub)
initialize('perfil e notificações', initPersonalExtras)
initialize('check-ins', initCheckins)
initialize('agenda', initAgenda)
initialize('configuração da agenda', initAgendaSettings)
initialize('formulários', initForms)
initialize('atalhos', initShortcuts)
initialize('sincronização remota', initRemoteSync)
initialize('ferramentas web', initWebTools)
initialize('menu público', initPublicMenu)
initialize('acesso do personal', initPersonalAccess)
initialize('aplicativo instalável', initPwa)
initialize('atalho da logo', initLogoSecret)
initialize('escolha do aluno na evolução', initProgressPicker)
initialize('WhatsApp flutuante', initWhatsappFloat)
initialize('prévia dos treinos prontos', initPlanPreview)
