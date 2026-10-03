/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AccessType = 'CONTRATISTA' | 'VISITANTE' | 'ENTREGA' | 'CAMION' | 'VEHICULO';

/**
 * Tipos de salida vehicular declarados por el guardia al registrar una salida.
 *
 * Lista cerrada y deliberadamente simple (no es un sistema de incidencias):
 * sólo describe qué lleva el vehículo al salir. Es opcional: no declarar un
 * tipo nunca impide registrar la salida.
 */
export const VEHICLE_EXIT_TYPES = [
  'Con carga / materiales',
  'Vacío',
  'Carga parcial',
  'Sin carga declarada',
  'Otro',
] as const;

export type VehicleExitType = (typeof VEHICLE_EXIT_TYPES)[number];

export interface LogItem {
  id: string;
  name: string;
  rut: string;
  plate?: string;
  type: AccessType;
  action: 'Entrada' | 'Salida';
  time: string; // e.g. "18:14" or "06:30 AM"
  date: string; // "2026-06-02"
  unit: string;  // e.g. "Unit 115", "Service/Cleaning"
  avatar?: string;
  status: 'active' | 'exited';
  duration?: string; // e.g. "1h 15m" (calculated at exit)
  entryId?: string; // optional reference to the original entry log id
  entryTimestamp?: number; // optional timestamp for live on-site duration calculation
  // --- Vehicular exit metadata (optional, only used by the vehicle variant) ---
  /**
   * `true` marca una SALIDA DIRECTA: una salida registrada SIN entrada
   * correspondiente en esta portería (vehículo estacionado desde el turno
   * anterior, entró por otra portería, o la entrada nunca se registró).
   * Es la trazabilidad explícita de que NO existe una entrada local y que
   * NO se inventó una hora de entrada.
   */
  directExit?: boolean;
  /** Tipo de salida declarado por el guardia (carga/vacío/…). Opcional. */
  exitType?: VehicleExitType;
  /** Observación operacional asociada al movimiento. Opcional. */
  observation?: string;
}

export interface ActiveCheckIn {
  id: string; // original entry log id
  name: string;
  rut: string;
  plate?: string;
  type: AccessType;
  unit: string;
  entryTime: string;
  entryDate: string;
  entryTimestamp: number; // millisecond timestamp
  avatar?: string;
}

export interface IncidentReport {
  id: string;
  title: string;
  description: string;
  category: 'URGENTE' | 'MODERADO' | 'PREVENTIVO';
  time: string; // e.g. "18:14" or "06:30 AM"
  date: string; // "2026-08-02" — fecha REAL del incidente (no la de exportación)
  reporter: string;
  gate: string;
}

export interface GuardProfile {
  name: string;
  gate: string;
  shift: string;
  notifications: boolean;
  soundAlerts: boolean;
  biometricValidation: boolean;
}

export interface Persona {
  id: string;
  name: string;
  rut: string;
  plate?: string;
  type: AccessType;
  unit: string;
  avatar?: string;
}

// --- Vehicle quick-register contracts (portería) ---

/**
 * Resultado de un intento de ENTRADA vehicular por patente.
 *
 * `already_inside` es el MATCH contra la sesión ABIERTA existente: la entrada
 * se bloquea y se devuelve la sesión en curso (patente, empresa, hora de
 * entrada) para que la UI muestre "VEHÍCULO YA ESTÁ DENTRO" sin crear otra
 * entrada ni cerrar la sesión abierta.
 */
export type VehicleEntryResult =
  | { ok: true; log: LogItem }
  | { ok: false; reason: 'invalid_plate' }
  | { ok: false; reason: 'already_inside'; session: ActiveCheckIn };

/** Opciones opcionales de salida vehicular (todas opcionales). */
export interface VehicleExitOptions {
  /** Empresa declarada al salir (usada por la salida directa; la salida normal ya la tiene en su sesión). */
  company?: string;
  /** Tipo de salida declarado (carga/vacío/…). */
  exitType?: VehicleExitType;
  /** Observación operacional (ej. "no entrega nombre del conductor"). */
  observation?: string;
}

/**
 * Resultado de un intento de SALIDA DIRECTA (salida sin entrada local).
 *
 * `already_inside` indica que existe una sesión abierta: en ese caso
 * corresponde una SALIDA normal (la directa no escribe nada).
 */
export type VehicleDirectExitResult =
  | { ok: true; log: LogItem }
  | { ok: false; reason: 'invalid_plate' }
  | { ok: false; reason: 'already_inside' };
