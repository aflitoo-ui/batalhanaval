import Link from "next/link";

const SUPPORT_URL = "https://t.me/nick_ki";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

// Página pública, sem sessão — precisa ser acessível sem login pra revisão
// da Play Store e pra qualquer visitante ler antes de criar conta. Por isso
// vive fora dos grupos (app)/(billing), que exigem sessão.
export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Início"
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2}>
                <path
                  d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-zinc-100">Política de Privacidade</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Última atualização: 21 de agosto de 2026</p>
        </div>

        <p className="text-sm leading-relaxed text-zinc-400">
          O STRIX é um sistema de gestão de vendas, clientes e cobranças pra pequenos
          negócios, disponível na web e como aplicativo. Esta página explica quais
          dados o STRIX trata, pra quê, e com quem eles são compartilhados.
        </p>

        <Section title="Dados da sua conta">
          <p>
            Pra criar e manter sua conta: e-mail de login e senha (guardada como hash
            scrypt com salt — nunca em texto puro). Opcionalmente, se você assina um
            plano pago: nome, CPF/CNPJ e e-mail de cobrança, usados só pra emitir a
            cobrança.
          </p>
        </Section>

        <Section title="Dados do seu negócio">
          <p>
            Vendas, produtos e clientes que você cadastra no sistema — incluindo nome e
            telefone de cliente, quando informado. Esses dados existem pra você
            controlar o seu próprio negócio; não são usados pra nenhum outro fim, e
            cada conta só enxerga os próprios dados (nunca de outra conta).
          </p>
        </Section>

        <Section title="Telegram (opcional)">
          <p>
            Se você vincular sua conta ao Telegram, guardamos o identificador da
            conversa (chat ID) só pra poder te enviar avisos de vencimento e links de
            redefinição de senha por lá. Sem vínculo, nada é enviado.
          </p>
        </Section>

        <Section title="Dados técnicos">
          <p>
            Seu endereço IP é usado no momento da requisição pra limitar tentativas de
            login/cadastro e detectar abuso — não fica armazenado de forma permanente
            no banco de dados.
          </p>
        </Section>

        <Section title="Com quem compartilhamos">
          <p>
            <strong className="text-zinc-200">Processador de pagamento (Asaas):</strong>{" "}
            recebe CPF/CNPJ e e-mail de cobrança pra gerar a cobrança, só se você
            assinar um plano pago.
          </p>
          <p>
            <strong className="text-zinc-200">Telegram:</strong> recebe só o necessário
            pra entregar a mensagem, só se você vincular sua conta.
          </p>
          <p>
            <strong className="text-zinc-200">Infraestrutura (hospedagem e banco de dados):</strong>{" "}
            processa os dados só pra manter o serviço no ar, sem acesso pra qualquer
            outro fim.
          </p>
          <p>
            Não vendemos dados a terceiros, e não usamos rastreadores de publicidade
            nem SDKs de análise de comportamento.
          </p>
        </Section>

        <Section title="Como seus dados são protegidos">
          <p>
            Senha em hash irreversível, isolamento de dados por conta, e toda
            comunicação sob HTTPS/TLS. Detalhes técnicos em{" "}
            <Link href="/sobre" className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300">
              O que é o STRIX
            </Link>
            .
          </p>
        </Section>

        <Section title="Por quanto tempo guardamos">
          <p>Enquanto sua conta estiver ativa. Se você pedir a exclusão, apagamos seus dados.</p>
        </Section>

        <Section title="Seus direitos">
          <p>
            A qualquer momento, você pode pedir pra acessar, corrigir ou excluir seus
            dados — é só falar com o suporte.
          </p>
        </Section>

        <Section title="Crianças e adolescentes">
          <p>O STRIX não é direcionado a menores de idade.</p>
        </Section>

        <Section title="Mudanças nesta política">
          <p>Se algo mudar em como tratamos seus dados, esta página é atualizada.</p>
        </Section>

        <Section title="Contato">
          <p>
            Dúvidas ou pedidos sobre seus dados:{" "}
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300">
              fale com a gente no Telegram
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
