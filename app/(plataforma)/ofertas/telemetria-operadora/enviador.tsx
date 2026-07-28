"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { EstadoFormulario } from "../../aliados/acoes";
import { ErrosDoFormulario, MensagemDeSucesso } from "../../aliados/formularios";
import { acaoImportarRelatorio } from "./acoes";

/**
 * Envio do relatório da operadora (T34).
 *
 * **Estado próprio, e não `useActionState` — isto é correção de defeito
 * conhecido, não preferência.** O `FormularioComEstado` genérico serviria
 * a esta tela em tudo, menos nisto: com `useActionState`, o resultado só
 * chega pela contabilidade do React sobre o payload da resposta, e a F17
 * mediu esse payload sendo **descartado inteiro** em ~5 de 30 envios,
 * com o POST voltando 200 (ver README, "O payload da ação que às vezes é
 * descartado"). O e2e desta tela reproduziu exatamente a mesma assinatura
 * na primeira execução: a mensagem de confirmação simplesmente não
 * aparecia, sem erro nenhum.
 *
 * Aqui a consequência seria pior que na imagem: o usuário enviaria de
 * novo, achando que falhou. Ele não duplicaria nada — a RN67 garante isso
 * pelo hash —, mas ficaria sem saber o que entrou, que é justamente o que
 * a tela existe para dizer.
 *
 * A saída é a mesma da F17: a promessa da ação resolve no cliente, o
 * resultado vira estado deste componente, e a confirmação passa a ser
 * consequência do que ESTE código recebeu. O `router.refresh()` traz o
 * histórico novo quando a re-renderização automática se perde.
 */
export function EnviadorDeRelatorio() {
  const [estado, definirEstado] = useState<EstadoFormulario>({});
  const [ocupado, definirOcupado] = useState(false);
  const roteador = useRouter();

  async function executar(dados: FormData) {
    definirOcupado(true);
    definirEstado({});
    try {
      const resultado = await acaoImportarRelatorio({}, dados);
      definirEstado(resultado);
      if (resultado.sucesso) {
        roteador.refresh();
      }
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <form action={executar}>
      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />
      <div className="field" style={{ marginBottom: 12 }}>
        <label htmlFor="arquivo-telemetria-operadora">
          Arquivo do relatório (CSV ou XLSX)
        </label>
        <input
          id="arquivo-telemetria-operadora"
          className="input"
          type="file"
          name="arquivo"
          accept=".csv,.xlsx,text/csv"
          required
        />
        <span className="hint">
          Aceita os quatro layouts: catálogo de sellers, catálogo de ofertas, base de
          usuários e extrato de resgates. O tipo é reconhecido pelo cabeçalho — não há o
          que escolher aqui. Os dois catálogos produzem os contadores por oferta; os dois
          nominais ligam base e eventos ao assinante pelo CPF. Arquivo sem a coluna de CPF
          é aceito, e cada linha é recusada com a causa nomeada.
        </span>
      </div>
      <button type="submit" className="btn btn-azul" disabled={ocupado}>
        {ocupado ? "Enviando…" : "Enviar relatório"}
      </button>
    </form>
  );
}
