# Ficha de Módulo — Onda 11: Esteira de imagem e prontidão para implantação
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 27/07/2026

Onda de infraestrutura, sem tela e sem regra de negócio nova. Origem: preparação do handoff para o time de Tecnologia da Broto. Continuidade: regra **RN61**.

---

## 1. O problema que esta onda resolve

O `Dockerfile` do projeto foi escrito, comentado e teve o servidor standalone validado — mas a **imagem nunca foi construída**, porque o ambiente de desenvolvimento do projeto não tinha daemon Docker. Isso está declarado com honestidade no README e no roteiro de implantação, e é, hoje, **a única incógnita técnica do pacote entregue à TI**.

A consequência prática é ruim: a primeira pessoa a tentar construir a imagem descobre os problemas — permissões, usuário não-root, caminhos do standalone, arquivos ausentes no estágio final — sem contexto do projeto e sob a pressão de estar implantando. É o pior momento possível para uma descoberta.

**Esta onda elimina o problema na origem.** A imagem passa a ser construída, testada e publicada pela própria esteira do repositório, a cada mudança. O que a TI recebe deixa de ser *"aqui está um Dockerfile"* e passa a ser *"a imagem `v1.0.0` está publicada, testada, e sobe com estas variáveis"*.

## 2. O que a esteira faz

**Em cada pull request:** constrói a imagem. Se o `Dockerfile` quebrar, o PR fica vermelho — como qualquer outro defeito. Nada é publicado.

**Em cada merge na main:** constrói, **executa o teste de fumaça** e, passando, **publica no registro de contêineres do GitHub** (GHCR), que já vem com o repositório e não exige provisionar nada.

**Teste de fumaça — o coração da onda.** Não basta a imagem construir; ela precisa **subir e funcionar**. Contra um PostgreSQL descartável, a esteira: aplica as migrations, roda o seed, sobe o contêiner com as variáveis mínimas, e verifica que a aplicação responde — a rota de saúde, a tela de entrada, e que uma rota protegida **recusa** acesso anônimo. Sem isso, publicaríamos imagens que constroem e não funcionam, que é pior que não publicar.

**Etiquetas de publicação:** a versão do `package.json` (`1.0.0`), o identificador curto do commit, e `latest`. A versão permite à TI fixar o que está em produção; o commit permite rastrear exatamente o que subiu; `latest` serve para ambientes de teste.

## 3. Rota de saúde

A aplicação ganha uma rota de verificação de saúde — hoje inexistente, e **exigida por qualquer balanceador ou orquestrador** que a TI venha a usar. Requisitos:

- **Pública**, sem autenticação (o balanceador não faz login), e **sem revelar nada**: responde apenas se está de pé e se alcança o banco. Nenhuma versão de dependência, nenhum detalhe de ambiente, nenhuma contagem de registro.
- Distingue **vivo** (o processo responde) de **pronto** (alcança o banco) — a diferença importa para orquestrador decidir entre esperar e reiniciar.
- Barata: não faz consulta de negócio, não escreve nada.

## 4. Documentação de operação

O README ganha a seção **"Executando a imagem"**, escrita para quem vai implantar e não conhece o projeto: como obter a imagem publicada, quais variáveis são obrigatórias, como rodar migrations como passo separado, como agendar o job diário, e como verificar que subiu. Comandos literais, prontos para colar.

## 5. Regra

61. **RN61 — Imagem publicada é imagem testada.** Nenhuma imagem é publicada no registro sem ter construído **e** passado no teste de fumaça — subir contra banco real, aplicar migrations, semear e responder às rotas de verificação. Imagem que constrói mas não sobe não é entregável. A rota de saúde é pública e não revela informação de ambiente, versão de dependência ou dado de negócio.

## 6. Fora de escopo

Provisionamento de infraestrutura de destino (é da TI, com o roteiro de implantação já entregue); infraestrutura como código; adaptador S3 de exportações; assinatura de imagem e varredura de vulnerabilidade — desejáveis, mas dependem da política corporativa de Brasilseg/BB e devem seguir o padrão da casa, não um inventado aqui.

## 7. Pendências

**[A CONFIRMAR — TI]:** se o registro final será o GHCR ou um registro corporativo. A onda publica no GHCR porque não exige provisionamento e está disponível hoje; migrar o destino depois é mudança de configuração, não de arquitetura.
