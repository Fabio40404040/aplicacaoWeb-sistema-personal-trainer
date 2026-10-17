// Dono do site (a página principal farisafit.com.br mostra o "Meu site" dele,
// tem tudo liberado, sem selo, e não pode excluir a própria conta).
// É a conta deste e-mail; antes era "a conta mais antiga", que podia trocar
// sozinha. Se o e-mail não existir no banco, vale a mais antiga como antes.
export const OWNER_EMAIL = 'fabiogisel7@gmail.com'
export const OWNER_SQL = `SELECT id FROM trainers ORDER BY CASE WHEN lower(email)='${OWNER_EMAIL}' THEN 0 ELSE 1 END, created_at, id LIMIT 1`
