import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { importarTelemetria } from "./telemetria";

/**
 * A importação de telemetria da Onda 1 vista pela trilha de auditoria.
 *
 * **Por que este arquivo nasceu depois do caso de uso.** `telemetria.ts` era
 * o único importador sem teste de integração — o ciclo só era exercitado pela
 * suíte e2e, que confere a TELA (contagens, quarentena, agregados) e nunca
 * olhou a trilha. Foi exatamente nessa sombra que o defeito viveu: a
 * importação gravava procedência em `Importacao`, a tela mostrava tudo certo,
 * e a T28 não registrava nada. A e2e passava, porque ela nunca perguntou.
 *
 * O que se prova aqui é o que a tela não mostra, e por isso o arquivo existe
 * mesmo sendo curto.
 *
 * As linhas são SINTÉTICAS, no mesmo desenho da fixture da e2e: CPF fictício
 * que reprova o dígito verificador, e id de oferta que não existe na base —
 * o evento entra sem vínculo, que é um dos caminhos a cobrir.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const MARCA = "[TESTE-TRILHA-F4]";
const ARQUIVO = `${MARCA} telemetria.csv`;
const ENTIDADE = "ImportacaoTelemetriaVoucher";
const PREFIXO_VOUCHER = "TRILHA-F4-";
const CPF_SINTETICO = "111.111.111-11"; // reprova o dígito verificador
const ID_OFERTA_INEXISTENTE = "oferta-externa-sem-cadastro-trilha-f4";

function csvSintetico(): string {
  return [
    "data_hora_evento;cpf_assinante;id_seller;id_oferta;id_voucher;tipo_evento;valor_transacao;canal",
    `2026-07-20T10:00:00;${CPF_SINTETICO};S;${ID_OFERTA_INEXISTENTE};${PREFIXO_VOUCHER}1;emissao_voucher;;app`,
    `2026-07-20T11:00:00;${CPF_SINTETICO};S;${ID_OFERTA_INEXISTENTE};${PREFIXO_VOUCHER}1;resgate_voucher;;app`,
    // Tipo fora do cardápio contratual: vai para quarentena com motivo, e a
    // contagem precisa chegar à trilha — importação que recusou metade do
    // arquivo não é a mesma coisa que importação limpa.
    `2026-07-20T12:00:00;${CPF_SINTETICO};S;${ID_OFERTA_INEXISTENTE};${PREFIXO_VOUCHER}9;reembolso;;web`,
  ].join("\n");
}

describe.skipIf(!temBanco)("importação de telemetria (Onda 1) — trilha de auditoria", () => {
  const prisma = new PrismaClient();
  let analista: { id: string; papel: "ANALISTA" };
  let leitura: { id: string; papel: "LEITURA" };

  async function limpar() {
    await prisma.telemetriaEvento.deleteMany({ where: { arquivoOrigem: ARQUIVO } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidade: ENTIDADE } });
    await prisma.importacao.deleteMany({ where: { nomeArquivo: ARQUIVO } });
  }

  beforeAll(async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { endsWith: "@dev.clubebroto.local" } },
    });
    analista = { id: usuarios.find((u) => u.papel === "ANALISTA")!.id, papel: "ANALISTA" };
    leitura = { id: usuarios.find((u) => u.papel === "LEITURA")!.id, papel: "LEITURA" };
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("grava evento na trilha com autor, identificador da importação e as contagens", async () => {
    const relatorio = await importarTelemetria(analista, {
      nomeArquivo: ARQUIVO,
      conteudo: csvSintetico(),
    });

    expect(relatorio.importados).toBe(2);
    expect(relatorio.emQuarentena).toBe(1);

    const eventos = await prisma.auditoriaEvento.findMany({ where: { entidade: ENTIDADE } });
    expect(eventos).toHaveLength(1);

    const evento = eventos[0]!;
    expect(evento.entidadeId).toBe(relatorio.importacaoId);
    expect(evento.autorId).toBe(analista.id);
    expect(evento.valorAnterior).toBeNull();

    const registrado = JSON.parse(evento.valorNovo ?? "{}");
    expect(registrado).toMatchObject({
      nomeArquivo: ARQUIVO,
      totalLinhas: 3,
      importados: 2,
      emQuarentena: 1,
      semVinculoOferta: 2,
    });
  });

  /*
   * O CPF chega ao caso de uso em claro e sai hasheado (RN36/RN69). A trilha
   * é um dos lugares mais fáceis de vazá-lo sem perceber: basta alguém achar
   * útil registrar "as linhas importadas". A asserção é sobre o texto inteiro
   * do evento, e não sobre campos escolhidos, justamente para pegar o vazamento
   * que vier por um campo que ainda não existe.
   */
  it("não carrega dado de dentro do arquivo para a trilha", async () => {
    await importarTelemetria(analista, { nomeArquivo: ARQUIVO, conteudo: csvSintetico() });

    const evento = await prisma.auditoriaEvento.findFirst({ where: { entidade: ENTIDADE } });
    // Sem esta linha o teste passaria com a trilha VAZIA — `JSON.stringify(null)`
    // não contém CPF nenhum. Asserção de ausência precisa provar antes que há
    // onde o dado poderia estar.
    expect(evento).not.toBeNull();
    const texto = JSON.stringify(evento);

    expect(texto).not.toContain(CPF_SINTETICO);
    expect(texto).not.toContain(CPF_SINTETICO.replace(/\D/g, ""));
    expect(texto).not.toContain(PREFIXO_VOUCHER);
  });

  /*
   * Reimportar o mesmo arquivo não cria evento de telemetria nenhum (RN07,
   * `skipDuplicates`) — mas cria entrada na trilha, e isso é o contrário de
   * uma inconsistência: a trilha registra o ATO de alguém ter importado, não
   * o efeito. Importação que não mudou nada é justamente o que se quer poder
   * explicar depois.
   */
  it("reimportação não duplica fatos, e ainda assim fica registrada", async () => {
    const primeira = await importarTelemetria(analista, {
      nomeArquivo: ARQUIVO,
      conteudo: csvSintetico(),
    });
    const segunda = await importarTelemetria(analista, {
      nomeArquivo: ARQUIVO,
      conteudo: csvSintetico(),
    });

    expect(primeira.importados).toBe(2);
    expect(segunda.importados).toBe(0);
    expect(segunda.duplicados).toBe(2);

    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: ENTIDADE },
      orderBy: { criadoEm: "asc" },
    });
    expect(eventos).toHaveLength(2);
    expect(eventos.map((evento) => evento.entidadeId)).toEqual([
      primeira.importacaoId,
      segunda.importacaoId,
    ]);
  });

  it("papel Leitura não importa telemetria, e nada chega à trilha", async () => {
    await expect(
      importarTelemetria(leitura, { nomeArquivo: ARQUIVO, conteudo: csvSintetico() }),
    ).rejects.toThrow(/não tem permissão/);

    expect(await prisma.auditoriaEvento.count({ where: { entidade: ENTIDADE } })).toBe(0);
  });
});
