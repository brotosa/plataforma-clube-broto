import { describe, expect, it } from "vitest";
import {
  COLUNAS_EXTRATO,
  type EventoDeTrilha,
  classificarSensibilidade,
  eCriacao,
  eSensivel,
  entidadesDeParametro,
  montarDiferenca,
  nomeArquivoExtrato,
  serializarExtratoCsv,
} from "./extrato";
import { ENTIDADE_AUDITORIA } from "@/infra/parametrizador/familias";

const evento = (parcial: Partial<EventoDeTrilha>): EventoDeTrilha => ({
  id: "e1",
  entidade: "empresa",
  entidadeId: "emp1",
  campo: "nomeFantasia",
  valorAnterior: null,
  valorNovo: "Aliada",
  autorId: "u1",
  autorNome: "Ana",
  criadoEm: new Date("2026-07-24T13:45:06.000Z"),
  ...parcial,
});

describe("marcador de evento sensível (ficha §4)", () => {
  it("marca o acesso pleno a dados de PF pelo campo", () => {
    expect(
      classificarSensibilidade({ entidade: "assinante", campo: "acesso_dados_plenos" }),
    ).toBe("ACESSO_PF");
  });

  it("marca exportação de lista, kit de campanha e o próprio extrato", () => {
    expect(classificarSensibilidade({ entidade: "exportacao_lista", campo: "finalidade" })).toBe(
      "EXPORTACAO",
    );
    expect(classificarSensibilidade({ entidade: "kit_campanha", campo: "versao" })).toBe(
      "EXPORTACAO",
    );
    expect(
      classificarSensibilidade({ entidade: "exportacao_auditoria", campo: "filtros" }),
    ).toBe("EXPORTACAO");
  });

  it("marca alteração de parâmetro e de regra de aprovação", () => {
    expect(classificarSensibilidade({ entidade: "valor_regra", campo: "valor" })).toBe(
      "PARAMETRO",
    );
    expect(classificarSensibilidade({ entidade: "meta_periodo", campo: "alvo" })).toBe(
      "PARAMETRO",
    );
    expect(classificarSensibilidade({ entidade: "aprovacao_regra", campo: "ativa" })).toBe(
      "REGRA_APROVACAO",
    );
  });

  // ---- casos negativos: evento comum NÃO recebe marcador ----
  it("não marca a edição corriqueira de aliado, oferta ou campanha", () => {
    expect(classificarSensibilidade({ entidade: "empresa", campo: "nomeFantasia" })).toBeNull();
    expect(classificarSensibilidade({ entidade: "oferta", campo: "status" })).toBeNull();
    expect(classificarSensibilidade({ entidade: "campanha", campo: "estado" })).toBeNull();
    expect(eSensivel({ entidade: "solucao", campo: "titulo" })).toBe(false);
  });

  it("não marca a edição do assinante que não é acesso pleno", () => {
    expect(classificarSensibilidade({ entidade: "assinante", campo: "uf" })).toBeNull();
  });

  // Fitness: família nova no Parametrizador sem entrar na lista de
  // entidades de parâmetro passaria a gravar evento sensível sem marcador.
  it("cobre TODAS as famílias de lista do Parametrizador", () => {
    const declaradas = entidadesDeParametro();
    for (const entidade of Object.values(ENTIDADE_AUDITORIA)) {
      expect(
        declaradas.has(entidade),
        `entidade "${entidade}" é escrita pelo Parametrizador mas não está classificada como sensível`,
      ).toBe(true);
    }
  });
});

describe("visão antes → depois", () => {
  it("campo simples vira uma linha, com a mudança destacada", () => {
    const linhas = montarDiferenca({
      campo: "status",
      valorAnterior: "RASCUNHO",
      valorNovo: "PUBLICADA",
    });
    expect(linhas).toEqual([
      { rotulo: "status", antes: "RASCUNHO", depois: "PUBLICADA", mudou: true },
    ]);
  });

  it("valor JSON vira uma linha por chave, unindo os dois lados em ordem estável", () => {
    const linhas = montarDiferenca({
      campo: "importacao_nucleo",
      valorAnterior: JSON.stringify({ uf: "PR", nome: "Fulano" }),
      valorNovo: JSON.stringify({ uf: "SC", nome: "Fulano", preferencia: "WHATSAPP" }),
    });
    expect(linhas.map((l) => l.rotulo)).toEqual(["nome", "preferencia", "uf"]);
    expect(linhas.find((l) => l.rotulo === "nome")?.mudou).toBe(false);
    expect(linhas.find((l) => l.rotulo === "uf")).toEqual({
      rotulo: "uf",
      antes: "PR",
      depois: "SC",
      mudou: true,
    });
    expect(linhas.find((l) => l.rotulo === "preferencia")).toEqual({
      rotulo: "preferencia",
      antes: null,
      depois: "WHATSAPP",
      mudou: true,
    });
  });

  it("JSON inválido cai para a linha simples em vez de estourar", () => {
    const linhas = montarDiferenca({
      campo: "resumo",
      valorAnterior: "{isto não é json",
      valorNovo: "{também não",
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.rotulo).toBe("resumo");
  });

  it("array JSON não é decomposto por chave — só objeto é", () => {
    const linhas = montarDiferenca({
      campo: "diferenciais",
      valorAnterior: '["a"]',
      valorNovo: '["a","b"]',
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.mudou).toBe(true);
  });

  it("reconhece a criação (sem valor anterior)", () => {
    expect(eCriacao({ valorAnterior: null, valorNovo: "Aliada" })).toBe(true);
    expect(eCriacao({ valorAnterior: "Antiga", valorNovo: "Aliada" })).toBe(false);
    expect(eCriacao({ valorAnterior: null, valorNovo: null })).toBe(false);
  });
});

describe("RN48 — extrato CSV para auditoria externa", () => {
  it("emite cabeçalho e uma linha por evento, com a data em UTC declarado", () => {
    const csv = serializarExtratoCsv([evento({})]);
    const linhas = csv.trimEnd().split("\n");
    expect(linhas[0]).toBe(COLUNAS_EXTRATO.join(";"));
    expect(linhas[1]).toContain("2026-07-24T13:45:06.000Z");
    expect(linhas).toHaveLength(2);
  });

  it("leva a NATUREZA do evento sensível, não um sim/não", () => {
    const csv = serializarExtratoCsv([
      evento({ entidade: "valor_regra", campo: "valor" }),
      evento({ entidade: "empresa", campo: "site" }),
    ]);
    const [, sensivel = "", comum = ""] = csv.trimEnd().split("\n");
    expect(sensivel.endsWith(";PARAMETRO")).toBe(true);
    expect(comum.endsWith(";")).toBe(true);
  });

  it("escapa aspas, ponto e vírgula e quebra de linha", () => {
    const csv = serializarExtratoCsv([
      evento({ valorNovo: 'Razão; "Social"\ncom quebra', autorNome: "Ana; Silva" }),
    ]);
    expect(csv).toContain('"Razão; ""Social""\ncom quebra"');
    expect(csv).toContain('"Ana; Silva"');
  });

  it("extrato vazio ainda traz o cabeçalho — arquivo sem coluna não é extrato", () => {
    expect(serializarExtratoCsv([])).toBe(`${COLUNAS_EXTRATO.join(";")}\n`);
  });

  it("nomeia o arquivo de forma estável e ordenável", () => {
    expect(nomeArquivoExtrato(new Date("2026-07-24T13:45:06.000Z"))).toBe(
      "extrato-auditoria-2026-07-24T13-45-06-000Z.csv",
    );
  });
});
