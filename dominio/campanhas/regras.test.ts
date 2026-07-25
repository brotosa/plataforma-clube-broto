import { describe, expect, it } from "vitest";
import {
  avisoDoEncerramento,
  cestaPodeEntrarEmCampanha,
  diffDoKit,
  efeitoDoEncerramento,
  ofertasPublicadasDaCampanha,
  ofertasQueBloqueiamCesta,
  podeAtivar,
  portasDaAtivacao,
  proximaVersaoDoKit,
  transicoesValidasDe,
  validarAtivacao,
  type CestaDoConteudo,
  type ConteudoKit,
  type DadosAtivacao,
  type OfertaVinculadaAoEncerramento,
} from "./regras";

const ofertaPublicada = (id: string, titulo = `Oferta ${id}`) =>
  ({ id, titulo, status: "PUBLICADA" }) as const;
const ofertaRascunho = (id: string, titulo = `Oferta ${id}`) =>
  ({ id, titulo, status: "RASCUNHO" }) as const;

const ativacaoCompleta = (): DadosAtivacao => ({
  contagemPublico: 1240,
  vigenciaInicio: new Date("2026-08-01"),
  vigenciaFim: new Date("2026-08-31"),
  ofertasAvulsas: [ofertaPublicada("of-1")],
  cestas: [],
});

describe("RN38 — portas da ativação", () => {
  it("libera a ativação com público, oferta publicada e vigência", () => {
    expect(podeAtivar(ativacaoCompleta())).toBe(true);
    expect(validarAtivacao(ativacaoCompleta())).toEqual([]);
  });

  it("bloqueia quando o público não alcança ninguém", () => {
    const erros = validarAtivacao({ ...ativacaoCompleta(), contagemPublico: 0 });
    expect(erros).toContain("O público precisa alcançar ao menos um assinante (RN38).");
  });

  it("bloqueia quando nenhuma oferta vinculada está publicada", () => {
    const erros = validarAtivacao({
      ...ativacaoCompleta(),
      ofertasAvulsas: [ofertaRascunho("of-2")],
    });
    expect(erros).toContain(
      "A campanha precisa de ao menos uma oferta publicada, direta ou por cesta (RN38).",
    );
  });

  it("aceita a oferta publicada que chega por cesta liberada", () => {
    const dados: DadosAtivacao = {
      ...ativacaoCompleta(),
      ofertasAvulsas: [],
      cestas: [{ id: "c-1", nome: "Cesta Solo Vivo", ofertas: [ofertaPublicada("of-3")] }],
    };
    expect(podeAtivar(dados)).toBe(true);
  });

  it("não conta oferta que vem por cesta bloqueada pela RN41", () => {
    const dados: DadosAtivacao = {
      ...ativacaoCompleta(),
      ofertasAvulsas: [],
      cestas: [
        {
          id: "c-2",
          nome: "Cesta incompleta",
          ofertas: [ofertaPublicada("of-4"), ofertaRascunho("of-5")],
        },
      ],
    };
    expect(podeAtivar(dados)).toBe(false);
  });

  it("bloqueia sem vigência definida", () => {
    const erros = validarAtivacao({ ...ativacaoCompleta(), vigenciaInicio: null });
    expect(erros).toContain(
      "A campanha precisa de vigência definida, com fim não anterior ao início (RN38).",
    );
  });

  it("bloqueia vigência com fim anterior ao início", () => {
    expect(
      podeAtivar({
        ...ativacaoCompleta(),
        vigenciaInicio: new Date("2026-08-31"),
        vigenciaFim: new Date("2026-08-01"),
      }),
    ).toBe(false);
  });

  it("aceita vigência de prazo indeterminado (sem fim)", () => {
    expect(podeAtivar({ ...ativacaoCompleta(), vigenciaFim: null })).toBe(true);
  });

  it("explica cada porta na ordem da T23", () => {
    expect(portasDaAtivacao(ativacaoCompleta()).map((p) => p.chave)).toEqual([
      "publico",
      "conteudo",
      "vigencia",
    ]);
  });

  it("não repete a oferta que está avulsa e também dentro de uma cesta", () => {
    const publicadas = ofertasPublicadasDaCampanha({
      ofertasAvulsas: [ofertaPublicada("of-6")],
      cestas: [{ id: "c-3", nome: "Cesta", ofertas: [ofertaPublicada("of-6")] }],
    });
    expect(publicadas).toHaveLength(1);
  });
});

describe("RN41 — cesta só entra em campanha com tudo publicado", () => {
  it("libera cesta com todas as ofertas publicadas", () => {
    const cesta: CestaDoConteudo = {
      id: "c-4",
      nome: "Cesta pronta",
      ofertas: [ofertaPublicada("of-7"), ofertaPublicada("of-8")],
    };
    expect(cestaPodeEntrarEmCampanha(cesta)).toBe(true);
    expect(ofertasQueBloqueiamCesta(cesta)).toEqual([]);
  });

  it("aponta quais ofertas bloqueiam a cesta", () => {
    const cesta: CestaDoConteudo = {
      id: "c-5",
      nome: "Cesta travada",
      ofertas: [ofertaPublicada("of-9"), ofertaRascunho("of-10", "Kit análise de solo")],
    };
    expect(cestaPodeEntrarEmCampanha(cesta)).toBe(false);
    expect(ofertasQueBloqueiamCesta(cesta).map((o) => o.titulo)).toEqual([
      "Kit análise de solo",
    ]);
  });

  it("bloqueia cesta vazia — não há o que executar", () => {
    expect(cestaPodeEntrarEmCampanha({ id: "c-6", nome: "Vazia", ofertas: [] })).toBe(false);
  });

  it("trata oferta encerrada como bloqueio (sai da cesta com aviso)", () => {
    const cesta: CestaDoConteudo = {
      id: "c-7",
      nome: "Cesta com encerrada",
      ofertas: [{ id: "of-11", titulo: "Oferta encerrada", status: "ENCERRADA" }],
    };
    expect(cestaPodeEntrarEmCampanha(cesta)).toBe(false);
  });
});

describe("RN40 — encerramento pausa as exclusivas e desvincula a vitrine", () => {
  const exclusiva: OfertaVinculadaAoEncerramento = {
    id: "of-12",
    titulo: "Desconto exclusivo da campanha",
    status: "PUBLICADA",
    destinacao: "CAMPANHA",
    destinacaoCampanhaId: "camp-1",
  };
  const daVitrine: OfertaVinculadaAoEncerramento = {
    id: "of-13",
    titulo: "Assinatura anual",
    status: "PUBLICADA",
    destinacao: "VITRINE",
    destinacaoCampanhaId: null,
  };

  it("pausa a oferta exclusiva da campanha encerrada", () => {
    const efeito = efeitoDoEncerramento("camp-1", [exclusiva, daVitrine]);
    expect(efeito.pausar.map((o) => o.id)).toEqual(["of-12"]);
    expect(efeito.desvincular.map((o) => o.id)).toEqual(["of-13"]);
  });

  it("não pausa exclusiva de OUTRA campanha", () => {
    const efeito = efeitoDoEncerramento("camp-2", [exclusiva]);
    expect(efeito.pausar).toEqual([]);
    expect(efeito.desvincular.map((o) => o.id)).toEqual(["of-12"]);
  });

  it("não pausa exclusiva que já não está publicada", () => {
    const efeito = efeitoDoEncerramento("camp-1", [{ ...exclusiva, status: "ENCERRADA" }]);
    expect(efeito.pausar).toEqual([]);
  });

  it("lista no aviso prévio as ofertas que serão pausadas", () => {
    const aviso = avisoDoEncerramento(efeitoDoEncerramento("camp-1", [exclusiva, daVitrine]));
    expect(aviso).toContain("Desconto exclusivo da campanha");
    expect(aviso).toContain("RN40");
  });

  it("avisa que nada será pausado quando só há oferta de vitrine", () => {
    const aviso = avisoDoEncerramento(efeitoDoEncerramento("camp-1", [daVitrine]));
    expect(aviso).toContain("Nenhuma oferta será pausada");
  });
});

describe("RN45 — kit imutável, versionado e com diff", () => {
  const conteudo = (): ConteudoKit => ({
    publicoContagem: 1240,
    vigenciaInicio: "2026-08-01",
    vigenciaFim: "2026-08-31",
    instrucoes: "Disparar e-mail na primeira semana.",
    ofertas: [{ id: "of-1", titulo: "Frete grátis", idExternoMinutrade: "MT-1" }],
    cestas: [{ id: "c-1", nome: "Cesta Solo Vivo" }],
    pecas: [{ formato: "E-mail", titulo: "Sua safra merece", temImagem: true }],
  });

  it("numera a primeira versão como 1", () => {
    expect(proximaVersaoDoKit([])).toBe(1);
  });

  it("numera a versão seguinte a partir da maior existente", () => {
    expect(proximaVersaoDoKit([1, 2, 3])).toBe(4);
  });

  it("não gera diff na v1 — não há anterior", () => {
    expect(diffDoKit(null, conteudo())).toBeNull();
  });

  it("registra o que entrou e o que saiu do manifesto", () => {
    const novo: ConteudoKit = {
      ...conteudo(),
      ofertas: [{ id: "of-2", titulo: "Kit análise de solo", idExternoMinutrade: "MT-2" }],
    };
    const diff = diffDoKit(conteudo(), novo);
    expect(diff).toContain("− oferta: Frete grátis");
    expect(diff).toContain("+ oferta: Kit análise de solo");
  });

  it("registra mudança de contagem do público congelado", () => {
    const diff = diffDoKit(conteudo(), { ...conteudo(), publicoContagem: 1300 });
    expect(diff).toContain("− público: 1240 assinantes");
    expect(diff).toContain("+ público: 1300 assinantes");
  });

  it("diz explicitamente quando nada mudou", () => {
    expect(diffDoKit(conteudo(), conteudo())).toBe("Sem mudanças no manifesto.");
  });
});

describe("ciclo de vida da campanha", () => {
  it("permite Rascunho → Ativa e Ativa → Encerrada", () => {
    expect(transicoesValidasDe("RASCUNHO")).toEqual(["ATIVA"]);
    expect(transicoesValidasDe("ATIVA")).toEqual(["ENCERRADA"]);
  });

  it("não permite sair de Encerrada", () => {
    expect(transicoesValidasDe("ENCERRADA")).toEqual([]);
  });
});
