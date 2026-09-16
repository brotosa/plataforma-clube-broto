import type { ResumoDePolitica } from "@/dominio/usuarios/resumo-politicas";

/**
 * Faixa de panorama da T35 — o estado das cinco proteções, acima das abas.
 *
 * **Por que existe.** As abas organizam, mas escondem: sem esta faixa, quem
 * administra o portal pode nunca abrir a aba "Bloqueios" e nunca descobrir que
 * o bloqueio por origem existe — desligado. A rolagem longa que as abas
 * substituíram tinha essa virtude, de mostrar tudo que há, e a faixa é o que a
 * devolve. Por isso ela fica **fora** do sistema de abas, sempre visível, e
 * cobre as quatro proteções mesmo quando três delas estão em outra aba.
 *
 * Reusa o `kpi-row`/`kpi-cel` já existente: quatro colunas que colapsam para
 * duas a 1000px e uma a 560px, sem CSS novo.
 *
 * O texto de cada célula vem do domínio (`resumo-politicas`), não daqui — a
 * tela não pode ter uma segunda opinião sobre o que "desligado" significa.
 */

/** Uma célula, com a contagem operacional quando houver. */
function Celula({ resumo, bloqueados }: { resumo: ResumoDePolitica; bloqueados?: number }) {
  return (
    <div className="kpi-cel">
      <span className="cap">{resumo.rotulo}</span>
      {/*
        Valor em texto, não em número: "30 min sem atividade" não cabe nos 29px
        do `.v`. O `.v.indisp-v` tem o registro certo, mas é a célula de
        INDISPONIBILIDADE da RN53 e reusá-la aqui confundiria quem ler depois.
        Fica em `style` por ora — é uma tela só, e a convenção da Onda 14 pede
        classe quando o padrão aparecer na terceira.
        Desligada sai em `--paragrafo-aaa`, o token de texto DERIVADO: apagado
        diz "não está fazendo nada" sem o alarme do vermelho, que seria exagero
        — origem desligada é o padrão da casa, não um defeito. O `--cinza` puro
        foi a primeira tentativa e reprovou em axe: 2,16:1 sobre `--branco` a
        14px bold. O token derivado mantém o efeito de apagado e passa.
      */}
      <span
        style={{
          font: "var(--font-body-regular)",
          fontWeight: 700,
          color: resumo.desligada ? "var(--paragrafo-aaa)" : "var(--preto)",
          lineHeight: 1.3,
        }}
      >
        {resumo.principal}
      </span>
      <span className="cap">{resumo.detalhe}</span>
      {bloqueados !== undefined && bloqueados > 0 ? (
        <span className="cap" style={{ color: "var(--erro-texto-aaa)", fontWeight: 700 }}>
          {bloqueados === 1 ? "1 bloqueado agora" : `${bloqueados} bloqueados agora`}
        </span>
      ) : null}
    </div>
  );
}

export function FaixaPanorama({
  senha,
  credencial,
  sessao,
  login,
  origem,
  contasBloqueadas,
  origensBloqueadas,
}: {
  senha: ResumoDePolitica;
  credencial: ResumoDePolitica;
  sessao: ResumoDePolitica;
  login: ResumoDePolitica;
  origem: ResumoDePolitica;
  contasBloqueadas: number;
  origensBloqueadas: number;
}) {
  return (
    <div
      className="kpi-row kpi-row-5"
      aria-label="Panorama das configurações de segurança"
      role="group"
    >
      <Celula resumo={senha} />
      {/* Ao lado da Senha, e não no detalhe dela: é a única proteção da aba
          que pode deixar alguém DE FORA, e isso não pode depender de quem leu
          a linha inteira até o fim. */}
      <Celula resumo={credencial} />
      <Celula resumo={sessao} />
      <Celula resumo={login} bloqueados={contasBloqueadas} />
      <Celula resumo={origem} bloqueados={origensBloqueadas} />
    </div>
  );
}
