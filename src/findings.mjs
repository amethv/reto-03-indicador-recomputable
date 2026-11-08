// Hallazgos del criterio 2. Funciones puras: reciben filas ya verificadas contra el sello
// y devuelven conteos e IDs. Nunca devuelven nombres de actores, usuarios ni técnicos.

export const HOURS_TOLERANCE = 0.02; // absorbe el redondeo a dos decimales del campo declarado
const EDIT_ACTION = 'EDITAR_FECHA_RESOLUCION';

export const ratio = (numerator, denominator) => ({numerator, denominator, percent: numerator / denominator * 100});

/** 187 del lote → menos tickets nacidos de reaperturas → menos casos de Nivel 3 → publicado. */
export function denominatorBreakdown(tickets, reportRow) {
  const reopened = tickets.filter(t => t.ticket_origen).map(t => t.ticket_id);
  const level3 = tickets.filter(t => t.nivel_resolucion === '3').map(t => t.ticket_id);
  const overlap = level3.filter(id => reopened.includes(id));
  const derived = tickets.length - new Set([...reopened, ...level3]).size;
  const published = Number(reportRow.incidentes_recibidos_publicado);
  const publishedManaged = Number(reportRow.incidentes_gestionados_publicado);
  return {
    total: tickets.length, reopened, level3, overlap, derived, published,
    matches: derived === published,
    publishedManaged,
    // 171 − 168: el lote no permite saber qué tickets se dejaron fuera del numerador.
    managedGapUnexplained: published - publishedManaged,
    publishedPercent: Number(reportRow.porcentaje_publicado)
  };
}

function parseEditDetail(detail) {
  const hours = /horas_resolucion\s+(\d+(?:\.\d+)?)\s*->\s*(\d+(?:\.\d+)?)/.exec(detail);
  const sla = /cumple_sla\s+(SI|NO)\s*->\s*(SI|NO)/.exec(detail);
  return {
    hoursBefore: hours ? Number(hours[1]) : null, hoursAfter: hours ? Number(hours[2]) : null,
    slaBefore: sla ? sla[1] : null, slaAfter: sla ? sla[2] : null
  };
}

/** Ediciones posteriores a la resolución registradas en la bitácora. Solo se expone el rol. */
export function resolutionEdits(events, tickets, catalog) {
  const byId = new Map(tickets.map(t => [t.ticket_id, t]));
  const services = new Map(catalog.map(s => [s.servicio_id, s]));
  return events.filter(e => e.accion === EDIT_ACTION).map(e => {
    const ticket = byId.get(e.referencia);
    const values = parseEditDetail(e.detalle);
    const service = ticket ? services.get(ticket.servicio_id) : null;
    const slaHours = service ? Number(service.sla_horas_habiles) : null;
    const csvHours = ticket ? Number(ticket.horas_habiles_resolucion) : null;
    const realWithin = values.hoursBefore === null || slaHours === null ? null : values.hoursBefore <= slaHours + 1e-9;
    return {
      event: e.evento_id, ticket: e.referencia, editedAt: e.timestamp, role: e.rol,
      ...values,
      inBatch: !!ticket,
      service: ticket?.servicio_id ?? null, serviceName: service?.nombre ?? null,
      priority: ticket?.prioridad ?? null, slaHours,
      resolvedAt: ticket?.fecha_resolucion ?? null,
      editedAfterResolution: !!ticket && Date.parse(e.timestamp) > Date.parse(ticket.fecha_resolucion),
      csvHours, csvDeclared: ticket?.cumple_sla ?? null,
      csvShowsEditedValue: csvHours !== null && values.hoursAfter !== null && Math.abs(csvHours - values.hoursAfter) <= HOURS_TOLERANCE,
      realWithin,
      changesCompliance: realWithin !== null && ticket ? realWithin !== (ticket.cumple_sla === 'SI') : false
    };
  });
}

/** Reaperturas que según la actividad 9 debieron conservar el número y generaron uno nuevo. */
export function misnumberedReopenings(reopenings, tickets) {
  const ids = new Set(tickets.map(t => t.ticket_id));
  return reopenings
    .filter(r => r.debio_conservar_numero === 'SI' && r.ticket_generado && r.ticket_generado !== r.ticket_original)
    .map(r => ({id: r.reapertura_id, original: r.ticket_original, generated: r.ticket_generado,
      businessDays: Number(r.dias_habiles_desde_cierre), date: r.fecha, generatedInBatch: ids.has(r.ticket_generado)}));
}

/** Indicador de SLA declarado (campo cumple_sla) y corregido con la bitácora. */
export function slaIndicator(tickets, details, edits) {
  const real = new Map(edits.filter(e => e.realWithin !== null).map(e => [e.ticket, e.realWithin]));
  const declared = tickets.filter(t => t.cumple_sla === 'SI').length;
  const computed = details.filter(d => d.within === true).length;
  const corrected = details.filter(d => (real.has(d.id) ? real.get(d.id) : d.within) === true).length;
  return {
    declared: ratio(declared, tickets.length),
    computedFromDates: ratio(computed, details.length),
    corrected: ratio(corrected, details.length),
    correctedTickets: [...real.keys()]
  };
}

/** Agrega a cada detalle la edición de bitácora que le corresponda. */
export function applyEdits(details, edits) {
  const byTicket = new Map(edits.map(e => [e.ticket, e]));
  return details.map(d => {
    const edit = byTicket.get(d.id);
    if (!edit) return d;
    return {...d, logEdit: edit, correctedWithin: edit.realWithin,
      discrepancies: [...d.discrepancies, 'fecha editada después de resolver (bitácora)']};
  });
}

export function computeFindings({tickets, catalog, reportRow, events, reopenings, result}) {
  const denominator = denominatorBreakdown(tickets, reportRow);
  const edits = resolutionEdits(events, tickets, catalog);
  const sla = slaIndicator(tickets, result.details, edits);
  const published = ratio(denominator.publishedManaged, denominator.published);
  published.percent = denominator.publishedPercent; // se muestra el valor declarado, no uno recalculado
  return {
    headline: {published: denominator.publishedPercent, confirmed: result.percentB},
    denominator, edits, sla,
    reopenings: misnumberedReopenings(reopenings, tickets),
    automatic: ratio(result.automatic, result.denominator),
    summary: {
      published,
      allClosures: ratio(result.numeratorA, result.denominator),
      confirmed: ratio(result.numeratorB, result.denominator),
      withinSLA: sla.corrected
    }
  };
}

/** Simulación de feriados: recalcula horas y SLA sin tocar el sello. */
export function simulateHolidays(details, holidays, businessHours) {
  const changed = [];
  let within = 0;
  for (const d of details) {
    if (!d.resolved) continue;
    const hours = businessHours(d.reported, d.resolved, holidays);
    const ok = hours <= d.sla + 1e-9;
    const base = d.correctedWithin ?? d.within;
    // Un ticket con edición registrada conserva su incumplimiento real: la fecha visible no es la original.
    const simulated = d.logEdit && d.logEdit.realWithin === false ? false : ok;
    if (simulated) within++;
    if (Math.abs(hours - d.hours) > 1e-9 || simulated !== base)
      changed.push({id: d.id, hoursBefore: d.hours, hoursAfter: hours, sla: d.sla, withinBefore: base, withinAfter: simulated, statusChanged: simulated !== base});
  }
  return {holidays: [...holidays], changed, statusChanged: changed.filter(c => c.statusChanged), within: ratio(within, details.length)};
}
