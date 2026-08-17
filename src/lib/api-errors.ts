import { NextResponse } from "next/server";

/**
 * Envolve um handler de rota com try/catch padrão: loga o erro completo no
 * servidor mas devolve pro cliente só uma mensagem genérica — nunca
 * err.message/stack, que podem revelar detalhes internos (string de conexão,
 * nomes de coluna, etc.).
 */
export function withApiErrors<Args extends unknown[]>(
  routeName: string,
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error(`[api:${routeName}]`, err);
      return NextResponse.json({ error: "Erro interno. Tente novamente em instantes." }, { status: 500 });
    }
  };
}
