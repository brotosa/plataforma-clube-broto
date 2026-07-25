import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { ROTULOS_PAPEL } from "@/dominio/autorizacao/papeis";
import { FormularioComEstado } from "../../aliados/formularios";
import { acaoAlternarRegra, acaoDefinirAprovadores } from "../acoes";

export const metadata: Metadata = {
  title: "Regras de aprovação",
};

const DESCRICAO_REGRA: Record<string, { titulo: string; descricao: string }> = {
  PROMOCAO_ALIADA_ATIVA: {
    titulo: "Promoção a Aliada ativa",
    descricao:
      "Quando ligada, a promoção entra na fila e exige decisão de outra pessoa (nasce LIGADA — RN06).",
  },
  PUBLICACAO_OFERTA: {
    titulo: "Publicação de oferta",
    descricao:
      "Quando ligada, publicar oferta passa a exigir aprovação — sem alteração de código (nasce DESLIGADA).",
  },
};

/** T7 — Regras do motor de aprovação, com interruptores nativos. */
export default async function PaginaRegrasAprovacao() {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  if (!podeExecutar(papel, "CONFIGURAR_REGRAS_APROVACAO")) {
    redirect("/aprovacoes");
  }

  const [regras, possiveisAprovadores] = await Promise.all([
    prisma.aprovacaoRegra.findMany({
      orderBy: { tipoEntidade: "asc" },
      include: { aprovadores: true },
    }),
    prisma.usuario.findMany({
      where: { ativo: true, papel: { in: ["GESTOR", "APROVADOR"] } },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 900 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/aprovacoes">Aprovações</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Regras de aprovação</b>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Regras de aprovação</h1>
        <div className="cap" style={{ marginTop: 4 }}>
          Por tipo de entidade: ligar/desligar a exigência e designar aprovadores — toda
          alteração é auditada
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {regras.map((regra) => {
          const detalhes = DESCRICAO_REGRA[regra.tipoEntidade] ?? {
            titulo: regra.tipoEntidade,
            descricao: "",
          };
          const idRotulo = `rotulo-regra-${regra.tipoEntidade}`;
          return (
            <div key={regra.id} className="card" style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <h2 className="h-el" id={idRotulo}>
                    {detalhes.titulo}
                  </h2>
                  <p className="cap" style={{ margin: "6px 0 0", maxWidth: "60ch" }}>
                    {detalhes.descricao}
                  </p>
                </div>
                <form action={acaoAlternarRegra} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="hidden" name="tipoEntidade" value={regra.tipoEntidade} />
                  <input type="hidden" name="exigida" value={regra.exigida ? "false" : "true"} />
                  <span className="cap" aria-hidden="true">
                    {regra.exigida ? "Aprovação exigida" : "Aprovação desligada"}
                  </span>
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={regra.exigida}
                    aria-label={`Exigência de aprovação para ${detalhes.titulo}`}
                    className={regra.exigida ? "sw on" : "sw"}
                  />
                </form>
              </div>

              <div style={{ borderTop: "1px solid var(--borda)", marginTop: 16, paddingTop: 14 }}>
                <FormularioComEstado
                  acao={acaoDefinirAprovadores}
                  rotuloEnviar="Salvar aprovadores designados"
                  classeBotao="btn btn-ghost btn-sm"
                >
                  <input type="hidden" name="tipoEntidade" value={regra.tipoEntidade} />
                  <p className="cap" style={{ margin: "0 0 10px" }}>
                    Aprovadores designados — vazio significa qualquer pessoa com papel de
                    aprovação (Gestor do Clube ou Aprovador). O solicitante nunca decide o
                    próprio item.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                    {possiveisAprovadores.map((usuario) => (
                      <label key={usuario.id} className="chip" style={{ userSelect: "none" }}>
                        <input
                          type="checkbox"
                          name="aprovadorIds"
                          value={usuario.id}
                          defaultChecked={regra.aprovadores.some(
                            (designado) => designado.usuarioId === usuario.id,
                          )}
                          style={{ accentColor: "var(--azul)" }}
                        />
                        {usuario.nome} · {ROTULOS_PAPEL[usuario.papel]}
                      </label>
                    ))}
                  </div>
                </FormularioComEstado>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
