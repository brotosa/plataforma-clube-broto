/**
 * Executor do job diário (RN03 + janela contratual) para agendadores
 * externos (cron do ambiente): `pnpm job:diario`.
 */
import { executarJobDiario } from "@/infra/jobs/job-diario";

executarJobDiario()
  .then((resultado) => {
    console.log(
      `Job diário: ${resultado.ofertasExpiradas} oferta(s) expirada(s); ` +
        `${resultado.contratosMarcados} contrato(s) entrando na janela; ` +
        `${resultado.contratosDesmarcados} saindo.`,
    );
  })
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  });
