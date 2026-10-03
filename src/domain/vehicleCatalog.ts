/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Domain layer: catálogo mínimo de VEHÍCULOS AUTORIZADOS.
 *
 * Modelo conceptual (deliberadamente mínimo, sin base de datos externa):
 *
 *   PATENTE → EMPRESA → AUTORIZADO
 *
 * Estados posibles:
 *   - AUTORIZADO    → la patente EXISTE en el catálogo (y trae su empresa).
 *   - NO REGISTRADO → la patente NO existe en el catálogo.
 *
 * REGLA CRÍTICA DEL PRODUCTO:
 *   "NO REGISTRADO" **NO bloquea** el registro del movimiento. Sólo indica
 *   que la patente no figura en el catálogo. La trazabilidad se mantiene
 *   siempre: el guardia puede registrar Entrada/Salida/Salida Directa igual.
 *   Este módulo es de SOLO LECTURA/consulta; no aplica ninguna regla de
 *   rechazo, autorización manual ni incidentes.
 *
 * La normalización de patentes se delega íntegramente en `domain/plate.ts`
 * (`normalizePlate`), de modo que "tsxd-99", "TSXD-99", "TSXD 99" y
 * "TSXD99" resuelven contra la MISMA entrada del catálogo.
 */

import { normalizePlate, formatPlateForDisplay } from './plate';

/** Estado de autorización visible de una patente frente al catálogo. */
export type VehicleAuthorizationStatus = 'AUTORIZADO' | 'NO REGISTRADO';

/**
 * Entrada del catálogo: una patente autorizada y su empresa asociada.
 * `plate` se almacena en forma CANÓNICA (sin separadores, mayúsculas).
 */
export interface AuthorizedVehicle {
  plate: string;
  company: string;
}

/** Resultado de consultar una patente contra el catálogo. */
export interface VehicleAuthorization {
  /** Patente canónica consultada ('' si la entrada era vacía). */
  plate: string;
  /** Patente formateada para mostrar (ej. "WWCC-80"). */
  displayPlate: string;
  /** Empresa del catálogo, o `null` si la patente no está registrada. */
  company: string | null;
  /** `true` si la patente existe en el catálogo. */
  registered: boolean;
  /** Estado visible: AUTORIZADO / NO REGISTRADO. */
  status: VehicleAuthorizationStatus;
}

/**
 * Consulta el catálogo por patente usando comparación CANÓNICA.
 *
 * Devuelve `undefined` si la patente no existe en el catálogo. La entrada
 * vacía nunca coincide (`normalizePlate('') === ''` se trata explícitamente
 * para no dar por autorizada una patente en blanco).
 */
export function findAuthorizedVehicle(
  catalog: readonly AuthorizedVehicle[],
  plateInput: string | undefined | null
): AuthorizedVehicle | undefined {
  const target = normalizePlate(plateInput);
  if (target === '') return undefined;
  return catalog.find(v => normalizePlate(v.plate) === target);
}

/**
 * Resuelve el estado de autorización de una patente.
 *
 * Es la función que consume la UI para mostrar AUTORIZADO / NO REGISTRADO.
 * NUNCA lanza y NUNCA bloquea: sólo informa.
 */
export function resolveAuthorization(
  catalog: readonly AuthorizedVehicle[],
  plateInput: string | undefined | null
): VehicleAuthorization {
  const plate = normalizePlate(plateInput);
  const match = plate === '' ? undefined : findAuthorizedVehicle(catalog, plate);

  return {
    plate,
    displayPlate: plate === '' ? '' : formatPlateForDisplay(plate),
    company: match ? match.company : null,
    registered: !!match,
    status: match ? 'AUTORIZADO' : 'NO REGISTRADO',
  };
}

/**
 * Empresa a precargar en el formulario de movimiento.
 *
 * Si la patente está en el catálogo devuelve su empresa (para que el guardia
 * NO tenga que escribirla de nuevo). Si no está, devuelve `null` y la UI deja
 * el campo empresa tal cual — el comportamiento operativo actual no cambia.
 */
export function suggestCompanyFromCatalog(
  catalog: readonly AuthorizedVehicle[],
  plateInput: string | undefined | null
): string | null {
  const match = findAuthorizedVehicle(catalog, plateInput);
  return match && match.company ? match.company : null;
}