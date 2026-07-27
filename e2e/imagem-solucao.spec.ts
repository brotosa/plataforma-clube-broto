import { expect, test } from "@playwright/test";
import {
  entrar,
  limparAliadoPorNome,
  prisma,
  runId,
  semViolacoesAxe,
  semearAliadoAtivoComContrato,
  semearSolucaoCompleta,
} from "./ajudantes";

/**
 * F17 (Onda 10) pela interface: imagem do card da solução (RN60).
 *
 * O percurso que importa é o de ponta a ponta — enviar na T3, ver na
 * pré-visualização, ver no card de oferta que apresenta aquela solução — e
 * as recusas, que precisam nomear a causa (RN55). O SVG é o caso próprio
 * desta entidade: arquivo válido, formato que não serve aqui.
 */

/** PNG 1×1 real (não é desenho inventado: é o menor PNG válido). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SVG_VALIDO = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#465EFF"/></svg>',
  "utf8",
);

/** PNG com cabeçalho válido e corpo grande — passa do teto de 400 KB. */
const PNG_GRANDE = Buffer.concat([PNG_1X1.subarray(0, 8), Buffer.alloc(420 * 1024, 0x7a)]);

async function prepararSolucao(nome: string) {
  const aliado = await semearAliadoAtivoComContrato(nome);
  const solucao = await semearSolucaoCompleta(aliado.id, `Solução ${nome}`);
  return { aliado, solucao };
}

test.describe("RN60 — imagem do card da solução", () => {
  test("envia a imagem e ela aparece na pré-visualização e no card de oferta", async ({ page }) => {
    const nome = `Aliado Imagem ${runId()}`;
    const { aliado, solucao } = await prepararSolucao(nome);
    try {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}`);

      // Sem imagem: tratamento neutro, nunca espaço quebrado.
      await expect(page.getByRole("heading", { name: "Imagem do card" })).toBeVisible();
      await expect(page.getByRole("img", { name: `Imagem do card de ${solucao.nome}` })).toHaveCount(
        0,
      );

      await page.getByLabel("Enviar a imagem do card").setInputFiles({
        name: "card.png",
        mimeType: "image/png",
        buffer: PNG_1X1,
      });
      await page.getByRole("button", { name: "Enviar imagem" }).click();
      await expect(page.getByText("Imagem do card atualizada.")).toBeVisible();

      // Na moldura do cartão.
      await expect(
        page.getByRole("img", { name: `Imagem do card de ${solucao.nome}` }),
      ).toBeVisible();

      // E na pré-visualização do card, que antes só sabia dizer "pendente".
      await expect(page.getByText("imagem do card pendente")).toHaveCount(0);
      const naPreview = page.locator(`.vcard .img img[src*="/api/solucoes/${solucao.id}/imagem"]`);
      await expect(naPreview).toBeVisible();

      // No card de oferta: a oferta apresenta a solução, e a imagem vai junto.
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}/ofertas/nova`);
      await expect(
        page.locator(`.vcard .img img[src*="/api/solucoes/${solucao.id}/imagem"]`),
      ).toBeVisible();
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("a rota serve a imagem com ETag pelo hash", async ({ page }) => {
    const nome = `Aliado ETag ${runId()}`;
    const { aliado, solucao } = await prepararSolucao(nome);
    try {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}`);
      await page.getByLabel("Enviar a imagem do card").setInputFiles({
        name: "card.png",
        mimeType: "image/png",
        buffer: PNG_1X1,
      });
      await page.getByRole("button", { name: "Enviar imagem" }).click();
      await expect(page.getByText("Imagem do card atualizada.")).toBeVisible();

      const resposta = await page.request.get(`/api/solucoes/${solucao.id}/imagem`);
      expect(resposta.status()).toBe(200);
      expect(resposta.headers()["content-type"]).toBe("image/png");
      const etag = resposta.headers()["etag"];
      expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
      expect(resposta.headers()["x-content-type-options"]).toBe("nosniff");

      // Revalidação: mesmo ETag, 304 sem corpo.
      const segunda = await page.request.get(`/api/solucoes/${solucao.id}/imagem`, {
        headers: { "if-none-match": etag ?? "" },
      });
      expect(segunda.status()).toBe(304);
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("troca e remoção, com a mensagem certa em cada uma", async ({ page }) => {
    const nome = `Aliado Troca ${runId()}`;
    const { aliado, solucao } = await prepararSolucao(nome);
    try {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}`);

      await page.getByLabel("Enviar a imagem do card").setInputFiles({
        name: "card.png",
        mimeType: "image/png",
        buffer: PNG_1X1,
      });
      await page.getByRole("button", { name: "Enviar imagem" }).click();
      await expect(page.getByText("Imagem do card atualizada.")).toBeVisible();

      // Remover: a mensagem é a da última operação, não a do envio anterior.
      await page.getByRole("button", { name: "Remover imagem" }).click();
      await expect(page.getByText("Imagem do card removida.")).toBeVisible();
      await expect(page.getByText("Imagem do card atualizada.")).toHaveCount(0);
      await expect(page.getByLabel("Enviar a imagem do card")).toBeVisible();
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("recusa SVG nomeando o formato, ainda que o arquivo seja válido", async ({ page }) => {
    const nome = `Aliado SVG ${runId()}`;
    const { aliado, solucao } = await prepararSolucao(nome);
    try {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}`);

      await page.getByLabel("Enviar a imagem do card").setInputFiles({
        name: "card.svg",
        mimeType: "image/svg+xml",
        buffer: SVG_VALIDO,
      });
      await page.getByRole("button", { name: "Enviar imagem" }).click();

      // A recusa diz o formato e os aceitos — não manda "conferir o
      // arquivo", que estaria errado: o arquivo está perfeito.
      const recusa = page.getByText(/A imagem do card não aceita SVG/);
      await expect(recusa).toBeVisible();
      await expect(recusa).toContainText("PNG, JPG ou WEBP");
      // A dica do campo também não promete SVG.
      await expect(page.getByText(/PNG, JPG ou WEBP, até 400 KB/)).toBeVisible();
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("recusa acima de 400 KB dizendo o tamanho e o limite", async ({ page }) => {
    const nome = `Aliado Grande ${runId()}`;
    const { aliado, solucao } = await prepararSolucao(nome);
    try {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}`);

      await page.getByLabel("Enviar a imagem do card").setInputFiles({
        name: "card.png",
        mimeType: "image/png",
        buffer: PNG_GRANDE,
      });
      await page.getByRole("button", { name: "Enviar imagem" }).click();

      await expect(page.getByText(/A imagem do card tem .* e o limite é 400 KB/)).toBeVisible();
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("recusa tipo real divergente da extensão, dizendo os dois", async ({ page }) => {
    const nome = `Aliado Divergente ${runId()}`;
    const { aliado, solucao } = await prepararSolucao(nome);
    try {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}`);

      // Conteúdo PNG com nome .webp: a extensão nunca decide.
      await page.getByLabel("Enviar a imagem do card").setInputFiles({
        name: "card.webp",
        mimeType: "image/webp",
        buffer: PNG_1X1,
      });
      await page.getByRole("button", { name: "Enviar imagem" }).click();

      const recusa = page.getByText(/extensão \.webp/);
      await expect(recusa).toBeVisible();
      await expect(recusa).toContainText("image/png");
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("a régua de completude conta a imagem enviada", async ({ page }) => {
    const nome = `Aliado Régua ${runId()}`;
    const { aliado, solucao } = await prepararSolucao(nome);
    try {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}`);

      await page.getByLabel("Enviar a imagem do card").setInputFiles({
        name: "card.png",
        mimeType: "image/png",
        buffer: PNG_1X1,
      });
      await page.getByRole("button", { name: "Enviar imagem" }).click();
      await expect(page.getByText("Imagem do card atualizada.")).toBeVisible();

      // O item da régua acende — é o que a RN09 exige para publicar.
      const itemDaRegua = page.locator("li,div", { hasText: "Imagem do card" }).first();
      await expect(itemDaRegua).toBeVisible();
      const gravada = await prisma.imagemSolucao.findUnique({
        where: { solucaoId: solucao.id },
        select: { bytes: true, tipoMime: true },
      });
      expect(gravada?.tipoMime).toBe("image/png");
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("axe AAA limpo na tela sem imagem", async ({ page }) => {
    const nome = `Aliado AAA ${runId()}`;
    const { aliado, solucao } = await prepararSolucao(nome);
    try {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}`);
      await expect(page.getByRole("heading", { name: "Imagem do card" })).toBeVisible();
      await semViolacoesAxe(page);
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("axe AAA limpo na tela com imagem", async ({ page }) => {
    const nome = `Aliado AAA img ${runId()}`;
    const { aliado, solucao } = await prepararSolucao(nome);
    try {
      // Semeada direto: a varredura de acessibilidade mede a tela COM
      // imagem, e encadear o upload aqui só acrescentaria uma corrida de
      // re-render entre a ação e o axe — foi o que deixou este teste
      // instável na primeira versão.
      const autor = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
      await prisma.imagemSolucao.create({
        data: {
          solucaoId: solucao.id,
          conteudo: PNG_1X1,
          tipoMime: "image/png",
          bytes: PNG_1X1.length,
          hash: `e2e-${solucao.id}`,
          nomeArquivo: "card.png",
          autorId: autor.id,
        },
      });

      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}`);
      await expect(
        page.getByRole("img", { name: `Imagem do card de ${solucao.nome}` }),
      ).toBeVisible();
      await semViolacoesAxe(page);
    } finally {
      await limparAliadoPorNome(nome);
    }
  });
});
