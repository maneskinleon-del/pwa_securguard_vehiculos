/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthorizedVehicle } from '../domain/vehicleCatalog';

/**
 * Semilla del catálogo de vehículos autorizados.
 *
 * Se siembra sólo en el PRIMER arranque (cuando no hay nada persistido bajo
 * `securguard_vehicle_catalog_v1`). Si esa clave existe — incluso como `[]` —
 * el valor persistido manda y la semilla no interviene.
 *
 * ── CATÁLOGO VACÍO A PROPÓSITO ──────────────────────────────────────────
 * La semilla está VACÍA para que el catálogo se cargue 100% mediante CSV real
 * (pantalla "IMPORTAR PATENTES") y así poder verificar de punta a punta que
 * la carga masiva funciona. No se eliminó el esquema: la clave de
 * almacenamiento, el hook `useVehicleCatalog`, el dominio
 * `domain/vehicleCatalog.ts` y `restoreDefaults()` siguen intactos.
 *
 * Para sembrar datos de ejemplo otra vez, basta con agregar entradas aquí
 * (patente en forma canónica, sin separadores) y limpiar la clave
 * `securguard_vehicle_catalog_v1` del navegador.
 *
 * Las patentes van en forma CANÓNICA porque la comparación real es canónica:
 * "WWCC-80" y "wwcc 80" encuentran la misma entrada.
 */
export const INITIAL_AUTHORIZED_VEHICLES: AuthorizedVehicle[] = [];
