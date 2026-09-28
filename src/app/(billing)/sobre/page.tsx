import Link from "next/link";
import { InstallSection } from "@/components/InstallSection";

const SUPPORT_URL = "https://t.me/nick_ki";

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-400">
        {icon}
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-300">{children}</div>
    </div>
  );
}

// Rótulo em negrito abrindo a linha — deixa a leitura escaneável (o olho
// pega o termo-chave sem ler a frase toda) sem cortar o texto completo pra
// quem quer o detalhe.
function Point({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p>
      <strong className="font-semibold text-zinc-100">{label}:</strong> {children}
    </p>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 17V11M13 17V7M18 17v-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth={2}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Página institucional, sem lógica nenhuma — só pra ter um lugar fixo (link
// dentro do menu da conta) que explica o app pra quem já é cliente, sem
// virar um tutorial de como usar as telas.
export default function SobrePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
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
          <h1 className="text-xl font-bold text-zinc-100">O que é o STRIX</h1>
        </div>
        <Link href="/" className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300">
          voltar pro sistema
        </Link>
      </div>

      <p className="text-sm leading-relaxed text-zinc-400">
        O STRIX é o sistema por trás do seu dia a dia de vendas — no computador ou no
        celular, sempre sincronizado.
      </p>

      <div className="space-y-4">
        <InstallSection />

        <Card icon={<ChartIcon />} title="Seu negócio, organizado">
          <Point label="Vendas">
            registre à vista ou fiado e veja na hora quanto já recebeu, quanto falta
            receber e qual é o lucro.
          </Point>
          <Point label="Cadastro">
            produtos e clientes, com pagamentos parciais acompanhados para você saber
            exatamente quem está em dia e quem está atrasado.
          </Point>
          <Point label="Relatórios">
            lucro mês a mês e quanto de dívida em aberto está acumulando — e há quanto
            tempo.
          </Point>
        </Card>

        <Card icon={<ShieldIcon />} title="Seus dados são só seus">
          <Point label="Senha">
            nunca é armazenada em texto puro. Ela é protegida com hash scrypt e um salt
            exclusivo por usuário, de forma que a senha original não fica armazenada no
            banco de dados.
          </Point>
          <Point label="Isolamento">
            cada conta é segregada por identificador de usuário no banco: toda consulta
            de vendas, clientes e produtos é filtrada por esse ID, então uma conta nunca
            enxerga dados de outra.
          </Point>
          <Point label="Conexão">
            protegida por HTTPS/TLS, e a sessão usa cookie httpOnly — inacessível a
            scripts na página.
          </Point>
        </Card>

        <Card icon={<DatabaseIcon />} title="Nada se perde">
          <Point label="Histórico">
            todo o registro de vendas e pagamentos fica guardado — nada some quando
            você fecha o app.
          </Point>
          <Point label="Sincronização">
            web e app mobile consultam o mesmo banco de dados em tempo real: o que você
            registra num aparelho já está disponível no outro, sem sincronização
            manual.
          </Point>
        </Card>

        <Card icon={<ClockIcon />} title="Esqueceu o app aberto?">
          <p>
            Sem problema. Depois de 10 minutos sem uso, a gente desloga sozinho — no
            site e no aplicativo — para impedir que outra pessoa acesse sua conta caso
            o aparelho fique parado.
          </p>
        </Card>
      </div>

      <p className="text-sm text-zinc-500">
        Ficou alguma dúvida?{" "}
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300">
          Fale com a gente
        </a>
        .
      </p>
    </div>
  );
}
