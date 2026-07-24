import pino from "pino";

/** Logger estruturado da aplicação (JSON em produção). */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { aplicacao: "plataforma-clube-broto" },
});
