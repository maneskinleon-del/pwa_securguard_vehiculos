/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Vehicle-specific CSV report builder.
 *
 * Consolidates vehicle entry/exit log pairs (matched by entryId via
 * reconstructSessions from domain/access.ts) into ONE row per session:
 *
 *   Fecha | Hora Entrada | Hora Salida | Empresa | Patente | Estado | Permanencia
 *         | Tipo de Salida | Observación
 *
 * Rules:
 *   - Does NOT modify logs, activeInside, handleVehicleEntry, or handleVehicleExit.
 *   - Does NOT eliminate Entrada/Salida events from the history log.
 *   - Matches by entryId (supports Entrada → Salida → Entrada → Salida).
 *   - Entry without exit = row with empty Salida and Estado "DENTRO".
 *   - SALIDA DIRECTA (Salida without local Entrada, flagged `directExit`) gets its
 *     own row: Hora Entrada is "—" (an entry hour is NEVER invented) and
 *     Tipo de Salida = "Salida directa".
 *   - Uses RFC 4180 CSV escaping via csvRow/csvDocument.
 *
 * Compatibilidad: las 7 columnas originales conservan su orden y significado;
 * "Tipo de Salida" y "Observación" se AÑADEN al final (ampliación mínima).
 */

import { LogItem, ActiveCheckIn, GuardProfile } from "../types";
import { reconstructSessions, AccessSession, formatDuration } from "../domain/access";
import { formatPlateForDisplay } from "../domain/plate";
import { csvRow, csvDocument, csvBlob } from "../utils/csv";
import { getLocalDateISO } from "../utils/datetime";

export interface VehicleReportParams {
  logs: LogItem[];
  activeInside: ActiveCheckIn[];
  profile: GuardProfile;
}

/** Number of currently-inside vehicles (type VEHICULO, rut === ''). */
const countVehiclesInside = (activeInside: ActiveCheckIn[]): number =>
  activeInside.filter(a => a.rut === "" && a.type === "VEHICULO").length;

/** Format a duration for the CSV: use pre-calculated duration (exited) or live (inside). */
const formatSessionDuration = (session: AccessSession, entryLog: LogItem): string => {
  // Vehicle has exited: use the pre-calculated duration from the exit log
  // (reconstructSessions calculates durationMs via entryTimestamp delta, which is
  // 0 for vehicle exits because handleMarkExit stores the ENTRY timestamp in
  // the exit's entryTimestamp field — so we prefer the exitLog's own duration field).
  if (session.exitLog?.duration) {
    return session.exitLog.duration;
  }
  // Vehicle still inside: calculate live duration from entry timestamp
  if (entryLog.entryTimestamp) {
    const liveMs = Date.now() - entryLog.entryTimestamp;
    if (liveMs > 0) return formatDuration(liveMs);
  }
  return "—";
};

/**
 * Build the vehicle access CSV report content.
 *
 * Returns a CRLF-separated string ready to be turned into a CSV blob.
 * Each vehicle session (Entrada → Salida pair) becomes one row, matching
 * the entryId link — NOT just by plate — to correctly handle repeated
 * entries/exits of the same vehicle.
 */
export const buildVehicleReportCSV = ({
  logs,
  activeInside,
  profile,
}: VehicleReportParams): string => {
  // Reconstruct ALL sessions from the full log history (entryId-based pairing)
  const allSessions = reconstructSessions(logs);

  // Filter for vehicle sessions only (type === VEHICULO, rut === "")
  const vehicleSessions = allSessions.filter(
    s => s.entryLog.type === "VEHICULO"
  );

  // Build rows: one per vehicle session (Entrada → Salida), plus one per direct exit
  const headers = [
    "Fecha",
    "Hora Entrada",
    "Hora Salida",
    "Empresa",
    "Patente",
    "Estado",
    "Permanencia",
    // --- Ampliación mínima (columnas 8-9) para distinguir SALIDA DIRECTA ---
    "Tipo de Salida",
    "Observación",
  ];

  const sessionRows = vehicleSessions.map(session => {
    const entry = session.entryLog;
    const exit = session.exitLog;
    const plate = formatPlateForDisplay(entry.plate || "");
    const company = entry.name && entry.name !== "Vehículo" ? entry.name : "—";
    const isStillInside = !exit;

    return [
      entry.date, // Fecha
      entry.time, // Hora Entrada
      exit ? exit.time : "—", // Hora Salida (em-dash si DENTRO)
      company, // Empresa
      plate, // Patente
      isStillInside ? "DENTRO" : "FUERA", // Estado
      formatSessionDuration(session, entry), // Permanencia
      isStillInside ? "—" : (exit?.exitType?.trim() ? exit.exitType : "Salida normal"), // Tipo de Salida
      exit?.observation?.trim() ? exit.observation : "—", // Observación
    ];
  });

  // SALIDA DIRECTA: salidas registradas SIN Entrada local (sin entryId, a
  // propósito). No son sesiones para reconstructSessions, así que se emiten
  // como filas propias con la hora de entrada vacía ("—").
  const directExitLogs = logs
    .filter(l => l.action === "Salida" && l.directExit === true)
    .reverse(); // logs llega nuevo→viejo; se emite viejo→nuevo (igual que las sesiones)

  const directExitRows = directExitLogs.map(exit => {
    const company = exit.name && exit.name !== "Vehículo" ? exit.name : "—";

    return [
      exit.date, // Fecha
      "—", // Hora Entrada (NO se inventa una entrada local)
      exit.time, // Hora Salida
      company, // Empresa
      formatPlateForDisplay(exit.plate || ""), // Patente
      "FUERA", // Estado
      "—", // Permanencia
      "Salida directa", // Tipo de Salida
      exit.observation?.trim() ? exit.observation : "—", // Observación
    ];
  });

  const rows = [...sessionRows, ...directExitRows];

  // Metadata header (mirrors the style of buildSecurityReportCSV)
  const topMeta = [
    "Reporte de Control Vehicular de Acceso",
    csvRow(["Guardia a Cargo:", profile.name || "-"]),
    csvRow(["Punto de Control:", profile.gate || "-"]),
    csvRow(["Fecha de Exportación:", new Date().toLocaleString()]),
    csvRow(["Vehículos Actualmente Dentro:", countVehiclesInside(activeInside)]),
    csvRow(["Total de Sesiones Vehiculares:", vehicleSessions.length]),
    csvRow(["Salidas Directas (sin entrada local):", directExitLogs.length]),
    "",
    "--- SESIONES VEHICULARES (Entrada → Salida por entryId; DENTRO si sigue abierta; SALIDA DIRECTA si no hubo entrada local) ---",
  ].join("\r\n");

  const tableContent = csvDocument([headers, ...rows]);

  return topMeta + "\r\n" + tableContent;
};

/**
 * Download the vehicle report as a CSV file.
 * Reuses the same blob/anchor mechanism as downloadSecurityReportCSV.
 */
export const downloadVehicleReportCSV = (
  csvContent: string,
  fileName: string
): void => {
  const blob = csvBlob(csvContent);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** Convenience: build + download in one call. */
export const exportVehicleReportCSV = (
  params: VehicleReportParams,
  fileName?: string
): void => {
  const content = buildVehicleReportCSV(params);
  const name = fileName || "SecurGuard-Vehiculos-" + getLocalDateISO() + ".csv";
  downloadVehicleReportCSV(content, name);
};
