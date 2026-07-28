import { createHash } from "node:crypto";
import {
  classificarChave,
  erroDeArquivoAusente,
  excessoDeTeto,
  TIPO_MIME_DO_ARTEFATO_GERADO,
} from "@/dominio/arquivos/artefato-derivado";
import {
  detectarTipoRealEntre,
  ErroDeEnvioDeArquivo,
} from "@/dominio/arquivos/arquivo-enviado";
import { TIPOS_ACEITOS as TIPOS_DE_IMAGEM_DE_PECA } from "@/dominio/campanhas/imagem-peca";
import { prisma } from "@/infra/prisma/cliente";
import { logger } from "@/infra/log/logger";

/**
 * RN71 — armazenamento dos arquivos derivados: peça de campanha, snapshot
 * de exportação (RN34) e kit de execução.
 *
 * **A porta não mudou nesta fase, e é para isso que ela existe.**
 * `salvar(chave, conteudo)` e `ler(chave)` são as mesmas assinaturas
 * escritas na F11. O que mudou foi a única implementação: até a F20 havia
 * `criarArmazenadorLocal`, que gravava em `var/exportacoes/` no disco da
 * máquina — e disco de produção é efêmero e por instância, então o arquivo
 * escrito numa instância não existia na seguinte nem depois de um deploy.
 * A ativação de campanha ia ler a peça e o `publico.csv` e não achava
 * nenhum dos dois. Era a falha que a Onda 13 veio consertar.
 *
 * **Uma implementação só, de propósito.** A local não ficou "para
 * desenvolvimento e CI": manter duas implementações da mesma porta é
 * exatamente o segundo caminho paralelo que o CLAUDE.md manda evitar, e o
 * defeito que ele produz aqui é o pior possível — desenvolvimento e CI
 * passariam por um caminho que produção nunca executa, que é como esta
 * falha chegou à produção sem ninguém ver. Agora é o mesmo código nos três
 * ambientes.
 *
 * **Onde o conteúdo mora.** No banco, na tabela `arquivos_armazenados` — a
 * quarta vez que a plataforma decide isso (marca RN54, card RN60, minuta
 * F19) e pelo mesmo motivo: poucos arquivos, pequenos, sem dependência
 * externa a provisionar. Os tetos da RN71 são a condição dessa decisão, e
 * a condição objetiva de revisá-la está no README.
 *
 * O `ExportAdapter` continua existindo e continua sendo o destino natural
 * quando o volume justificar; a porta é o que permite que ele entre sem
 * tocar domínio nem telas.
 */

export interface ArmazenadorSnapshots {
  salvar(chave: string, conteudo: Buffer): Promise<void>;
  ler(chave: string): Promise<Buffer>;
}

/** Hash SHA-256 (hex) do snapshot — gravado na exportação (RN34). */
export function hashDeSnapshot(conteudo: Buffer): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * Tipo do que está sendo gravado.
 *
 * Snapshot e kit a plataforma produziu, então o tipo é o que ela produziu.
 * A imagem da peça é apurada pelo CONTEÚDO, nunca pela extensão da chave —
 * confiar no nome é justamente o que a régua de arquivo existe para não
 * fazer. `application/octet-stream` cobre o que não se reconhece: é
 * descrição honesta de bytes, e o conteúdo é servido como anexo de
 * qualquer forma.
 */
function tipoDoConteudo(chave: string, conteudo: Buffer): string {
  const artefato = classificarChave(chave);
  if (artefato === "SNAPSHOT_DE_EXPORTACAO" || artefato === "KIT_DE_EXECUCAO") {
    return TIPO_MIME_DO_ARTEFATO_GERADO[artefato];
  }
  if (artefato === "IMAGEM_DE_PECA") {
    return detectarTipoRealEntre(conteudo, TIPOS_DE_IMAGEM_DE_PECA) ?? "application/octet-stream";
  }
  return "application/octet-stream";
}

/**
 * Aplica o teto da RN71 antes de gravar.
 *
 * Arquivo enviado por gente recusa — quem enviou troca o arquivo. Artefato
 * que a plataforma gerou **não recusa**: travar aqui deixaria a campanha
 * sem poder ativar e sem remédio ao alcance de quem está na tela, porque
 * ninguém encolhe um kit à mão. O excesso vira sinal no log, com o texto
 * que nomeia a condição objetiva de o adapter de objeto entrar.
 */
function conferirTeto(chave: string, conteudo: Buffer) {
  const excesso = excessoDeTeto(chave, conteudo.length);
  if (!excesso) return;
  if (excesso.recusa) {
    throw new ErroDeEnvioDeArquivo(excesso.mensagem);
  }
  logger.warn(
    { artefato: excesso.artefato, bytes: excesso.bytes, teto: excesso.teto, chave },
    "RN71 — artefato gerado acima do teto: gravado assim mesmo, condição objetiva atingida",
  );
}

/**
 * Grava o conteúdo, **fora de qualquer transação** — ver a nota de ordem
 * em `criarArmazenadorPrisma`. Não recebe `tx` de propósito: um parâmetro
 * de transação aqui seria um convite a envolver a gravação do kit na
 * transação da ativação, que é exatamente o que esta fase decidiu não
 * fazer.
 */
async function gravar(chave: string, conteudo: Buffer) {
  conferirTeto(chave, conteudo);
  const dados = {
    // `new Uint8Array` e não o `Buffer` cru: é a forma que o Prisma aceita
    // em campo `Bytes`, e é a mesma conversão que a marca e a minuta fazem.
    conteudo: new Uint8Array(conteudo),
    tipoMime: tipoDoConteudo(chave, conteudo),
    bytes: conteudo.length,
    hash: hashDeSnapshot(conteudo),
  };
  await prisma.arquivoArmazenado.upsert({
    where: { chave },
    create: { chave, ...dados },
    update: dados,
  });
}

/**
 * Implementação persistente da porta (RN71) — a única que existe.
 *
 * **A ORDEM DE GRAVAÇÃO É CONTEÚDO PRIMEIRO, REFERÊNCIA DEPOIS, e ela não
 * é envolvida em transação.** Foi decisão explícita, e o motivo é
 * operacional: a produção roda em função serverless atrás de RDS Proxy, e
 * escrita de dezenas de megabytes dentro de transação interativa fixa a
 * sessão no proxy e esgota o pool de conexões; um kit grande ainda tende a
 * estourar o tempo limite padrão do `$transaction`.
 *
 * O que se ganha com a inversão é a assimetria certa entre os dois modos
 * de falhar:
 *
 *   - falha DEPOIS de gravar o conteúdo e ANTES da referência → conteúdo
 *     órfão, que é lixo coletável e não afeta leitura nenhuma;
 *   - falha na ordem inversa → referência apontando para conteúdo que não
 *     existe, que é exatamente o defeito desta fase.
 *
 * O primeiro é inofensivo e o segundo não é, então a ordem é a que produz
 * o primeiro. Chave repetida sobrescreve (upsert): regravar a mesma chave
 * com o mesmo conteúdo é idempotente, e é o que acontece quando um retry
 * repete a gravação já feita.
 */
export function criarArmazenadorPrisma(): ArmazenadorSnapshots {
  return {
    async salvar(chave, conteudo) {
      await gravar(chave, conteudo);
    },
    async ler(chave) {
      const arquivo = await prisma.arquivoArmazenado.findUnique({
        where: { chave },
        select: { conteudo: true },
      });
      if (!arquivo) {
        // A chave está no registro e o conteúdo não existe: falha nomeada
        // (RN55), com o artefato e o que fazer. A chave carrega id interno,
        // então fica no log e não na mensagem.
        logger.warn({ chave }, "RN71 — chave sem conteúdo no armazenamento");
        throw erroDeArquivoAusente(chave);
      }
      return Buffer.from(arquivo.conteudo);
    },
  };
}
