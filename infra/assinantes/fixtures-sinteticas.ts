import type { PreferenciaAssinante, PrismaClient } from "@prisma/client";
import { completarDigitosCpf } from "@/dominio/assinantes/cpf";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";

/**
 * Gerador de assinantes SINTÉTICOS (regra de PF do CLAUDE.md): dados de
 * pessoa física em seeds/fixtures são sempre gerados e marcados — CPFs
 * algoritmicamente formados (base aleatória + dígitos verificadores),
 * nomes combinados de listas próprias, e-mails em exemplo.com.br e
 * marca_sintetico=true em todo registro (a UI exibe "registro
 * ilustrativo"). Jamais dados de pessoas reais.
 *
 * Determinístico por semente (PRNG mulberry32): o mesmo par
 * (quantidade, semente) produz exatamente a mesma base — os testes
 * comparam contagens do SQL com contagens calculadas em memória sobre
 * as MESMAS fixtures, sem nenhum número inventado.
 *
 * Municípios/UF e culturas vêm dos exemplos do protótipo v6.1
 * (referência do projeto); regiões seguem o mapa oficial UF→região.
 */

function mulberry32(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRIMEIROS_NOMES = [
  "Helena", "Otávio", "Marina", "Décio", "Cláudia", "Ubiratan", "Tereza",
  "Ivan", "Lúcia", "Ramiro", "Cecília", "Jonas", "Aurora", "Vicente",
  "Íris", "Baltazar", "Noêmia", "Plínio", "Zilda", "Evaristo",
];
const SOBRENOMES = [
  "Marques Vasconcelos", "Reis Bittencourt", "Coelho Andrade",
  "Prado Nogueira", "Ferraz Lopes", "Salles Monteiro", "Braga Siqueira",
  "Teles Camargo", "Fontes Barbosa", "Queiroz Peixoto", "Dutra Sales",
  "Amaral Pires", "Barros Leitão", "Serra Galvão", "Moura Tavares",
  "Pontes Aragão", "Neves Sampaio", "Rocha Valente", "Lins Menezes",
  "Cunha Dorneles",
];

interface Cidade {
  municipio: string;
  uf: string;
  ddd: string;
  regiao: string;
  /** Prefixo de CEP dentro da faixa da UF (5 dígitos). */
  prefixoCep: string;
}

/** Cidades dos exemplos do protótipo v6.1; regiões pelo mapa UF→região. */
const CIDADES: ReadonlyArray<Cidade> = [
  { municipio: "Ribeirão Preto", uf: "SP", ddd: "16", regiao: "Sudeste", prefixoCep: "14010" },
  { municipio: "Sertãozinho", uf: "SP", ddd: "16", regiao: "Sudeste", prefixoCep: "14160" },
  { municipio: "Uberaba", uf: "MG", ddd: "34", regiao: "Sudeste", prefixoCep: "38010" },
  { municipio: "Sorriso", uf: "MT", ddd: "66", regiao: "Centro-Oeste", prefixoCep: "78890" },
  { municipio: "Lucas do Rio Verde", uf: "MT", ddd: "65", regiao: "Centro-Oeste", prefixoCep: "78455" },
  { municipio: "Nova Mutum", uf: "MT", ddd: "65", regiao: "Centro-Oeste", prefixoCep: "78450" },
  { municipio: "Maringá", uf: "PR", ddd: "44", regiao: "Sul", prefixoCep: "87010" },
  { municipio: "Paiçandu", uf: "PR", ddd: "44", regiao: "Sul", prefixoCep: "87140" },
  { municipio: "Rio Verde", uf: "GO", ddd: "64", regiao: "Centro-Oeste", prefixoCep: "75901" },
  { municipio: "Passo Fundo", uf: "RS", ddd: "54", regiao: "Sul", prefixoCep: "99010" },
];

const LOGRADOUROS = [
  "Rua das Palmeiras", "Avenida Leste", "Estrada do Sol", "Rua Bela Vista",
  "Alameda das Acácias", "Rua Ipê Amarelo", "Travessa dos Pinhais",
  "Rodovia do Cerrado",
];
const BAIRROS = ["Centro", "Jardim Sumaré", "Zona Rural", "Boqueirão", "Vila Nova"];
const CULTURAS = ["soja", "milho", "café", "pastagem"];
const CONTATOS_PREFERIDOS = ["whatsapp", "e-mail", "telefone"];
const PREFERENCIAS: ReadonlyArray<PreferenciaAssinante> = [
  "AGRICULTURA", "AGRICULTURA", "PECUARIA", "AMBOS",
];

export interface AssinanteSintetico {
  cpf: string;
  nome: string;
  endereco: string;
  cep: string | null;
  email: string;
  telefone: string;
  preferencia: PreferenciaAssinante;
  uf: string | null;
  municipio: string | null;
  atributos: {
    cultura: string;
    "unidade-produtiva": string;
    "regiao-da-unidade-produtiva": string;
    "contato-preferido": string;
  };
  assinatura: {
    plano: "MENSAL" | "ANUAL";
    status: string;
    /** Dias a partir de "hoje" (negativo = vencida) — resolvido na inserção. */
    vencimentoEmDias: number;
  };
}

function sortear<T>(aleatorio: () => number, lista: ReadonlyArray<T>): T {
  return lista[Math.floor(aleatorio() * lista.length)]!;
}

function semAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Gera a base sintética determinística (mesma semente = mesma base). */
export function gerarAssinantesSinteticos(
  quantidade: number,
  semente = 1,
): AssinanteSintetico[] {
  const aleatorio = mulberry32(semente);
  const cpfsUsados = new Set<string>();
  const resultado: AssinanteSintetico[] = [];

  while (resultado.length < quantidade) {
    let base9 = "";
    for (let i = 0; i < 9; i += 1) {
      base9 += String(Math.floor(aleatorio() * 10));
    }
    const cpf = completarDigitosCpf(base9);
    if (cpfsUsados.has(cpf)) {
      continue;
    }
    cpfsUsados.add(cpf);

    const indice = resultado.length;
    const primeiro = sortear(aleatorio, PRIMEIROS_NOMES);
    const sobrenome = sortear(aleatorio, SOBRENOMES);
    const cidade = sortear(aleatorio, CIDADES);
    const numero = 10 + Math.floor(aleatorio() * 990);
    // ~5% sem endereço estruturado: exercita o estado "não derivado" (RN32).
    const enderecoDerivavel = aleatorio() >= 0.05;
    const endereco = enderecoDerivavel
      ? `${sortear(aleatorio, LOGRADOUROS)}, ${numero} — ${sortear(aleatorio, BAIRROS)}, ${cidade.municipio}/${cidade.uf}`
      : "s/n — endereço a completar";
    // ~60% com CEP (a presença no arquivo real é [A CONFIRMAR]).
    const temCep = aleatorio() < 0.6;
    const cep = temCep
      ? `${cidade.prefixoCep}-${String(100 + Math.floor(aleatorio() * 900))}`
      : null;

    const nome = `${primeiro} ${sobrenome}`;
    const email = `${semAcentos(primeiro).toLowerCase()}.${semAcentos(sobrenome.split(" ")[0]!).toLowerCase()}.${indice}@exemplo.com.br`;
    const telefone = `(${cidade.ddd}) 9${String(1000 + Math.floor(aleatorio() * 9000))}-${String(1000 + Math.floor(aleatorio() * 9000))}`;

    resultado.push({
      cpf,
      nome,
      endereco,
      cep,
      email,
      telefone,
      preferencia: sortear(aleatorio, PREFERENCIAS),
      uf: enderecoDerivavel || temCep ? cidade.uf : null,
      municipio: enderecoDerivavel ? cidade.municipio : null,
      atributos: {
        cultura: sortear(aleatorio, CULTURAS),
        "unidade-produtiva": `${cidade.municipio}/${cidade.uf}`,
        "regiao-da-unidade-produtiva": cidade.regiao,
        "contato-preferido": sortear(aleatorio, CONTATOS_PREFERIDOS),
      },
      assinatura: {
        plano: aleatorio() < 0.5 ? "MENSAL" : "ANUAL",
        status: "ativa",
        vencimentoEmDias: Math.floor(aleatorio() * 200) - 20,
      },
    });
  }
  return resultado;
}

/** CSV do núcleo (dicionário de exemplo — o real é [A CONFIRMAR]). */
export function gerarCsvNucleoSintetico(assinantes: ReadonlyArray<AssinanteSintetico>): string {
  const linhas = ["cpf_cliente;nome_completo;endereco_residencial;cep;e-mail;telefone;preferencia"];
  for (const assinante of assinantes) {
    const endereco = /[";\n]/.test(assinante.endereco)
      ? `"${assinante.endereco.replace(/"/g, '""')}"`
      : assinante.endereco;
    linhas.push(
      [
        assinante.cpf,
        assinante.nome,
        endereco,
        assinante.cep ?? "",
        assinante.email,
        assinante.telefone,
        assinante.preferencia.toLowerCase(),
      ].join(";"),
    );
  }
  return linhas.join("\n") + "\n";
}

/** CSV de enriquecimento sintético (casa por CPF; atributos do protótipo). */
export function gerarCsvEnriquecimentoSintetico(
  assinantes: ReadonlyArray<AssinanteSintetico>,
): string {
  const linhas = ["cpf;cultura;unidade produtiva;regiao da unidade produtiva;contato preferido"];
  for (const assinante of assinantes) {
    linhas.push(
      [
        assinante.cpf,
        assinante.atributos.cultura,
        assinante.atributos["unidade-produtiva"],
        assinante.atributos["regiao-da-unidade-produtiva"],
        assinante.atributos["contato-preferido"],
      ].join(";"),
    );
  }
  return linhas.join("\n") + "\n";
}

const LOTE_INSERCAO = 1_000;

/**
 * Insere a base sintética direto no banco (teste de performance e seed de
 * e2e). NÃO é o caminho de produção — cargas reais passam pela T20; por
 * isso não gera trilha de auditoria, e TUDO leva marca_sintetico=true.
 */
export async function inserirAssinantesSinteticos(
  prisma: PrismaClient,
  assinantes: ReadonlyArray<AssinanteSintetico>,
): Promise<void> {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);

  const slugs = [
    "cultura",
    "unidade-produtiva",
    "regiao-da-unidade-produtiva",
    "contato-preferido",
  ];
  const catalogoPorSlug = new Map<string, string>();
  for (const slug of slugs) {
    const item = await prisma.catalogoAtributo.upsert({
      where: { slug },
      update: {},
      create: { slug, nome: slug.replace(/-/g, " ") },
    });
    catalogoPorSlug.set(slug, item.id);
  }

  for (let inicio = 0; inicio < assinantes.length; inicio += LOTE_INSERCAO) {
    const lote = assinantes.slice(inicio, inicio + LOTE_INSERCAO);
    const comHash = lote.map((assinante) => ({
      ...assinante,
      cpfHash: hashCpf(assinante.cpf),
    }));
    await prisma.assinante.createMany({
      data: comHash.map((assinante) => ({
        cpfHash: assinante.cpfHash,
        cpfCifrado: cifrarCpf(assinante.cpf),
        nome: assinante.nome,
        enderecoBruto: assinante.endereco,
        cep: assinante.cep,
        uf: assinante.uf,
        municipio: assinante.municipio,
        email: assinante.email,
        telefone: assinante.telefone,
        preferencia: assinante.preferencia,
        marcaSintetico: true,
      })),
      skipDuplicates: true,
    });
    const criados = await prisma.assinante.findMany({
      where: { cpfHash: { in: comHash.map(({ cpfHash }) => cpfHash) } },
      select: { id: true, cpfHash: true },
    });
    const idPorHash = new Map(criados.map(({ cpfHash, id }) => [cpfHash, id]));

    await prisma.assinatura.createMany({
      data: comHash.map((assinante) => ({
        assinanteId: idPorHash.get(assinante.cpfHash)!,
        plano: assinante.assinatura.plano,
        status: assinante.assinatura.status,
        vencimento: new Date(
          hoje.getTime() + assinante.assinatura.vencimentoEmDias * 24 * 60 * 60 * 1000,
        ),
        origemDado: "SINTETICO",
      })),
      skipDuplicates: true,
    });
    await prisma.atributoEnriquecimento.createMany({
      data: comHash.flatMap((assinante) =>
        Object.entries(assinante.atributos).map(([slug, valor]) => ({
          assinanteId: idPorHash.get(assinante.cpfHash)!,
          catalogoId: catalogoPorSlug.get(slug)!,
          valor,
          fonte: "SINTETICO",
          dataReferencia: hoje,
        })),
      ),
    });
  }
}
