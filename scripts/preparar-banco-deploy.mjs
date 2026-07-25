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

execSync("prisma migrate deploy", { stdio: "inherit" });
execSync("prisma db seed", { stdio: "inherit" });
