/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthorizedVehicle } from '../domain/vehicleCatalog';

/**
 * Semilla del catálogo de vehículos autorizados.
 *
 * Se siembra sólo en el PRIMER arranque (cuando no hay nada persistido).
 * afterwards la fuente de verdad es `localStorage`, igual que el resto de la
 * app (logs, activeInside, profile). Sin base de datos externa.
 *
 * Las patentes van en forma CANÓNICA (sin separadores): la comparación real
 * es canónica, así que "WWCC-80" y "wwcc 80" encuentran esta misma entrada.
 */
export const INITIAL_AUTHORIZED_VEHICLES: AuthorizedVehicle[] = [
  { plate: 'WWCC80', company: 'Domatica' },
  { plate: 'HHCC29', company: 'Sacyr' },
  { plate: 'ABCD12', company: 'Constructora XYZ' },
  { plate: 'TSXD99', company: 'Transportes Sur' },
  { plate: 'KLPD45', company: 'Arriendo de Maquinarias' },
];