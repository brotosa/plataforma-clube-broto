/**
 * Etapa de banco do build hospedado (Vercel): aplica migrations e seed
 * quando DATABASE_URL existe; sem ela, apenas avisa e deixa o build
 * seguir (primeiro deploy, antes de o banco ser conectado ao projeto).
 */
import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.warn(
    "AVISO: DATABASE_URL ausente — migrations e seed pulados. " +
      "Conecte um banco ao projeto e refaça o deploy para a aplicação funcionar.",
  );
  process.exit(0);
}

// O lock consultivo do migrate pode estar ocupado por um deploy anterior
// (P1002, transitório) — tentar algumas vezes antes de falhar o build.
const TENTATIVAS = 3;
for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
  try {
    execSync("prisma migrate deploy", { stdio: "inherit" });
    break;
  } catch (erro) {
    if (tentativa === TENTATIVAS) {
      throw erro;
    }
    console.warn(`migrate deploy falhou (tentativa ${tentativa}/${TENTATIVAS}); aguardando 20 s…`);
    execSync("sleep 20");
  }
}
execSync("prisma db seed", { stdio: "inherit" });
