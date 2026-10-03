/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  findAuthorizedVehicle,
  resolveAuthorization,
  suggestCompanyFromCatalog,
  AuthorizedVehicle,
} from './vehicleCatalog';
import { INITIAL_AUTHORIZED_VEHICLES } from '../data/mockVehicleCatalog';

const CATALOG: AuthorizedVehicle[] = [
  { plate: 'WWCC80', company: 'Domatica' },
  { plate: 'HHCC29', company: 'Sacyr' },
  { plate: 'TSXD99', company: 'Sugerida' },
];

describe('vehicleCatalog — patente registrada → AUTORIZADO', () => {
  it('devuelve AUTORIZADO para una patente del catálogo', () => {
    const r = resolveAuthorization(CATALOG, 'WWCC80');
    expect(r.status).toBe('AUTORIZADO');
    expect(r.registered).toBe(true);
  });

  it('devuelve AUTORIZADO también con el formato con guion (WWCC-80)', () => {
    expect(resolveAuthorization(CATALOG, 'WWCC-80').status).toBe('AUTORIZADO');
  });

  it('expone la patente formateada para mostrar', () => {
    expect(resolveAuthorization(CATALOG, 'WWCC80').displayPlate).toBe('WWCC-80');
  });
});

describe('vehicleCatalog — patente registrada → empresa correcta', () => {
  it('devuelve la empresa del catálogo', () => {
    expect(resolveAuthorization(CATALOG, 'WWCC80').company).toBe('Domatica');
    expect(resolveAuthorization(CATALOG, 'HHCC29').company).toBe('Sacyr');
  });

  it('sugiere la empresa para precargar el formulario', () => {
    expect(suggestCompanyFromCatalog(CATALOG, 'WWCC-80')).toBe('Domatica');
    expect(suggestCompanyFromCatalog(CATALOG, 'HHCC29')).toBe('Sacyr');
  });

  it('findAuthorizedVehicle devuelve la entrada completa', () => {
    expect(findAuthorizedVehicle(CATALOG, 'HHCC-29')).toEqual({ plate: 'HHCC29', company: 'Sacyr' });
  });
});

describe('vehicleCatalog — patente inexistente → NO REGISTRADO', () => {
  it('devuelve NO REGISTRADO para una patente que no existe', () => {
    const r = resolveAuthorization(CATALOG, 'ZZZZ99');
    expect(r.status).toBe('NO REGISTRADO');
    expect(r.registered).toBe(false);
  });

  it('devuelve empresa null cuando no está registrada', () => {
    expect(resolveAuthorization(CATALOG, 'ZZZZ-99').company).toBeNull();
  });

  it('no sugiere empresa cuando no está registrada (deja el campo operativo actual)', () => {
    expect(suggestCompanyFromCatalog(CATALOG, 'ZZZZ-99')).toBeNull();
  });

  it('NO REGISTRADO con catálogo vacío', () => {
    expect(resolveAuthorization([], 'WWCC80').status).toBe('NO REGISTRADO');
  });

  it('NO REGISTRADO es informativo: no lanza y siempre devuelve un estado', () => {
    expect(() => resolveAuthorization(CATALOG, 'ZZZZ99')).not.toThrow();
    expect(resolveAuthorization(CATALOG, 'ZZZZ99').status).toBeDefined();
  });

  it('la entrada vacía nunca coincide con una patente del catálogo', () => {
    expect(resolveAuthorization(CATALOG, '').registered).toBe(false);
    expect(findAuthorizedVehicle(CATALOG, '')).toBeUndefined();
    expect(resolveAuthorization(CATALOG, '   ').registered).toBe(false);
  });

  it('tolera null/undefined sin lanzar', () => {
    expect(resolveAuthorization(CATALOG, null).status).toBe('NO REGISTRADO');
    expect(resolveAuthorization(CATALOG, undefined).status).toBe('NO REGISTRADO');
  });
});

describe('vehicleCatalog — normalización de patente', () => {
  it('las 4 variantes de tsxd-99 identifican la MISMA patente', () => {
    const variants = ['tsxd-99', 'TSXD-99', 'TSXD 99', 'TSXD99'];
    for (const v of variants) {
      const r = resolveAuthorization(CATALOG, v);
      expect(r.status).toBe('AUTORIZADO');
      expect(r.plate).toBe('TSXD99');
      expect(r.company).toBe('Sugerida');
    }
  });

  it('la normalización canónica se aplica a la entrada del catálogo también', () => {
    // El catálogo puede tener la patente guardada con separadores.
    const messy: AuthorizedVehicle[] = [{ plate: 'tsxd 99', company: 'Sugerida' }];
    expect(resolveAuthorization(messy, 'TSXD-99').status).toBe('AUTORIZADO');
    expect(suggestCompanyFromCatalog(messy, 'tsxd-99')).toBe('Sugerida');
  });

  it('wwcc-80 en cualquier formato es la misma patente que WWCC-80', () => {
    for (const v of ['wwcc-80', 'WWCC-80', 'WWCC 80', 'WWCC80']) {
      expect(resolveAuthorization(CATALOG, v).company).toBe('Domatica');
    }
  });
});

describe('vehicleCatalog — semilla inicial (catálogo vacío a propósito)', () => {
  // La semilla está VACÍA: el catálogo se carga 100% vía CSV
  // (pantalla IMPORTAR PATENTES). Estos tests fijan ese comportamiento.
  it('la semilla inicial está vacía', () => {
    expect(INITIAL_AUTHORIZED_VEHICLES).toEqual([]);
  });

  it('con la semilla vacía, WWCC-80 es NO REGISTRADO hasta importarlo', () => {
    const r = resolveAuthorization(INITIAL_AUTHORIZED_VEHICLES, 'WWCC-80');
    expect(r.status).toBe('NO REGISTRADO');
    expect(r.company).toBeNull();
  });

  it('con la semilla vacía, HHCC-29 es NO REGISTRADO hasta importarlo', () => {
    expect(resolveAuthorization(INITIAL_AUTHORIZED_VEHICLES, 'HHCC-29').status).toBe('NO REGISTRADO');
  });

  it('con la semilla vacía, ZZZZ-99 es NO REGISTRADO', () => {
    expect(resolveAuthorization(INITIAL_AUTHORIZED_VEHICLES, 'ZZZZ-99').status).toBe('NO REGISTRADO');
  });

  it('con la semilla vacía TODAS las patentes son NO REGISTRADO', () => {
    for (const p of ['WWCC-80', 'ABCD-12', 'TSXD-99', 'ZZZZ-99']) {
      expect(resolveAuthorization(INITIAL_AUTHORIZED_VEHICLES, p).status).toBe('NO REGISTRADO');
    }
  });

  it('WWCC-80 → Domatica funciona igual con un catálogo explícito', () => {
    const imported: AuthorizedVehicle[] = [{ plate: 'WWCC80', company: 'Domatica' }];
    const r = resolveAuthorization(imported, 'WWCC-80');
    expect(r.status).toBe('AUTORIZADO');
    expect(r.company).toBe('Domatica');
  });

  it('guarda las patentes del catálogo en forma canónica', () => {
    const imported: AuthorizedVehicle[] = [{ plate: 'WWCC80', company: 'Domatica' }];
    for (const v of [...INITIAL_AUTHORIZED_VEHICLES, ...imported]) {
      expect(v.plate).toBe(v.plate.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    }
  });
});