import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  EventoAuditoria,
  GravadorAuditoria,
} from "@/dominio/auditoria/servico-auditoria";

/** Cliente aceito: o PrismaClient global ou o cliente de uma transação. */
type ClientePrisma = PrismaClient | Prisma.TransactionClient;

/**
 * Persistência dos eventos de auditoria em `auditoria_eventos`.
 * Passar o cliente da transação da mutação garante atomicidade entre a
 * escrita de negócio e a trilha de auditoria.
 */
export function criarGravadorPrisma(cliente: ClientePrisma): GravadorAuditoria {
  return {
    async gravar(eventos: ReadonlyArray<EventoAuditoria>): Promise<void> {
      await cliente.auditoriaEvento.createMany({
        data: eventos.map((evento) => ({
          entidade: evento.entidade,
          entidadeId: evento.entidadeId,
          campo: evento.campo,
          valorAnterior: evento.valorAnterior,
          valorNovo: evento.valorNovo,
          autorId: evento.autorId,
        })),
      });
    },
  };
}
