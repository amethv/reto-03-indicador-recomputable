// Calendario del caso ficticio. No importar feriados de un país real sin fuente.
export const CALENDAR = Object.freeze({
  version: 'andania-2026-supuesto-v1',
  timezone: 'UTC-05:00',
  holidays: Object.freeze([]),
  source: 'El material entregado no contiene un calendario oficial de feriados.',
  status: 'SUPUESTO EXPLICITO: sin feriados adicionales; pendiente de calendario del organizador.'
});
export function holidaySet(dates) {
  if (!Array.isArray(dates)) throw new Error('Feriados: se requiere una lista de fechas ISO');
  const result = new Set();
  for (const date of dates) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date + 'T00:00:00Z')) ||
        new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date)
      throw new Error('Feriado inválido: ' + date);
    if (result.has(date)) throw new Error('Feriado duplicado: ' + date);
    result.add(date);
  }
  return result;
}
