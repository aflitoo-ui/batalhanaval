// Aceita tanto o `get` de fora de transação quanto o `tx.get` de dentro de
// uma — ambos têm a mesma assinatura.
type Getter = (sql: string, params?: unknown[]) => Promise<unknown>;

// Credita 1 convite pra quem virou cliente de confiança (pagante ou liberado
// pelo admin) pela primeira vez — invite_credit_earned trava isso pra não
// creditar de novo a cada pagamento recorrente ou renovação de acesso.
export async function grantInviteCreditOnce(db: { get: Getter }, userId: number) {
  await db.get(
    `UPDATE users SET invite_credits = invite_credits + 1, invite_credit_earned = true
     WHERE id = $1 AND invite_credit_earned = false`,
    [userId]
  );
}
