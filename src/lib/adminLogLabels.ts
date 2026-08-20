// Rótulo em português de cada tipo de ação do log administrativo — usado
// tanto no client (pra exibir) quanto na API (pra busca entender termos em
// português, já que o valor salvo no banco é sempre em inglês).
export const ACTION_LABEL: Record<string, string> = {
  grant_access: "Liberou acesso",
  revoke_access: "Revogou acesso",
  create_user: "Criou usuário",
  deactivate_user: "Desativou usuário",
  reactivate_user: "Reativou usuário",
  change_role: "Alterou papel",
  reset_password: "Redefiniu senha",
  reset_telegram: "Desvinculou Telegram",
  delete_user: "Excluiu usuário",
  grant_invite_credit: "Liberou +1 convite",
  generate_invite: "Gerou link de convite",
  signup_via_invite: "Padrinho de novo cadastro",
  send_password_reset: "Mandou link de redefinir senha (Telegram)",
};

export function actionLabel(action: string) {
  return ACTION_LABEL[action] || action;
}
