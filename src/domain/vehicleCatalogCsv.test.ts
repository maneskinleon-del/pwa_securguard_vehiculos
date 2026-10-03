/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseVehicleCatalogCSV,
  planCatalogImport,
  importVehicleCatalogCSV,
  detectDelimiter,
  normalizeCompany,
} from './vehicleCatalogCsv';
import { AuthorizedVehicle, resolveAuthorization } from './vehicleCatalog';

describe('A) CSV válido', () => {
  const csv = ['ABCD-12,Sacyr', 'EFGH-34,Domatica', 'IJKL-56,Syc Soluciones'].join('\n');

  it('parsea todas las filas válidas', () => {
    const r = parseVehicleCatalogCSV(csv);
    expect(r.rows).toHaveLength(3);
    expect(r.found).toBe(3);
    expect(r.invalid).toHaveLength(0);
  });

  it('reconoce las tres empresas del ejemplo', () => {
    const r = parseVehicleCatalogCSV(csv);
    expect(r.rows.map(x => x.company)).toEqual(['Sacyr', 'Domatica', 'Syc Soluciones']);
  });

  it('acepta CRLF (exportación de Excel)', () => {
    const r = parseVehicleCatalogCSV('ABCD-12,Sacyr\r\nEFGH-34,Domatica');
    expect(r.rows).toHaveLength(2);
  });

  it('acepta BOM de UTF-8', () => {
    const r = parseVehicleCatalogCSV('\uFEFFABCD-12,Sacyr');
    expect(r.rows[0].plate).toBe('ABCD12');
    expect(r.invalid).toHaveLength(0);
  });
});

describe('B) CSV vacío', () => {
  it('string vacío no produce filas ni errores', () => {
    const r = parseVehicleCatalogCSV('');
    expect(r.rows).toHaveLength(0);
    expect(r.found).toBe(0);
    expect(r.invalid).toHaveLength(0);
  });

  it('sólo espacios en blanco tampoco produce filas', () => {
    const r = parseVehicleCatalogCSV('   \n  \n');
    expect(r.rows).toHaveLength(0);
    expect(r.found).toBe(0);
  });

  it('el plan sobre un CSV vacío no agrega nada', () => {
    const plan = importVehicleCatalogCSV([], '');
    expect(plan.newEntries).toHaveLength(0);
    expect(plan.found).toBe(0);
  });
});

describe('C) Encabezado', () => {
  it('detecta y descarta el encabezado patente,empresa', () => {
    const r = parseVehicleCatalogCSV('patente,empresa\nABCD-12,Sacyr\nEFGH-34,Domatica');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toHaveLength(2);
    expect(r.found).toBe(2);
  });

  it('el encabezado NO cuenta como registro encontrado', () => {
    const r = parseVehicleCatalogCSV('patente,empresa\nABCD-12,Sacyr');
    expect(r.found).toBe(1);
  });

  it('funciona igual sin encabezado', () => {
    const r = parseVehicleCatalogCSV('ABCD-12,Sacyr');
    expect(r.hasHeader).toBe(false);
    expect(r.rows).toHaveLength(1);
  });

  it('acepta encabezados en mayúsculas y con tildes', () => {
    const r = parseVehicleCatalogCSV('PATENTE,EMPRESA\nABCD-12,Sacyr');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toHaveLength(1);
  });

  it('una fila cuya primera columna es "placa" también es encabezado', () => {
    const r = parseVehicleCatalogCSV('placa,razon\nABCD-12,Sacyr');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toHaveLength(1);
  });
});

describe('D) Líneas vacías', () => {
  it('ignora líneas vacías intercaladas', () => {
    const r = parseVehicleCatalogCSV('ABCD-12,Sacyr\n\n\nEFGH-34,Domatica\n');
    expect(r.rows).toHaveLength(2);
    expect(r.found).toBe(2);
  });

  it('ignora líneas con sólo espacios', () => {
    const r = parseVehicleCatalogCSV('ABCD-12,Sacyr\n     \nEFGH-34,Domatica');
    expect(r.rows).toHaveLength(2);
  });

  it('ignora líneas con sólo separadores', () => {
    const r = parseVehicleCatalogCSV('ABCD-12,Sacyr\n,\nEFGH-34,Domatica');
    expect(r.rows).toHaveLength(2);
  });

  it('ignora líneas vacías DESPUÉS del encabezado', () => {
    const r = parseVehicleCatalogCSV('patente,empresa\n\nABCD-12,Sacyr\n');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toHaveLength(1);
  });
});

describe('E) Patentes duplicadas', () => {
  it('descarta duplicados dentro del mismo archivo (gana la primera)', () => {
    const r = parseVehicleCatalogCSV('ABCD-12,Sacyr\nEFGH-34,Domatica\nABCD-12,Otra');
    expect(r.rows).toHaveLength(2);
    expect(r.duplicatesInFile).toBe(1);
    expect(r.rows[0].company).toBe('Sacyr');
  });

  it('detecta duplicados con distinto formato de patente', () => {
    const r = parseVehicleCatalogCSV('abcd-12,Sacyr\nABCD 12,Otra');
    expect(r.rows).toHaveLength(1);
    expect(r.duplicatesInFile).toBe(1);
  });

  it('una patente ya existente en el catálogo va a duplicados, no a nuevos', () => {
    const catalog: AuthorizedVehicle[] = [{ plate: 'ABCD12', company: 'Sacyr' }];
    const plan = importVehicleCatalogCSV(catalog, 'ABCD-12,Sacyr\nEFGH-34,Domatica');
    expect(plan.newEntries).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.newCatalog).toHaveLength(2);
  });

  it('NO sobrescribe la empresa de una patente ya existente', () => {
    const catalog: AuthorizedVehicle[] = [{ plate: 'ABCD12', company: 'Sacyr' }];
    const plan = importVehicleCatalogCSV(catalog, 'ABCD-12,Empresa Distinta');
    expect(plan.newEntries).toHaveLength(0);
    expect(plan.newCatalog[0].company).toBe('Sacyr');
  });

  it('duplicado dentro del archivo + duplicado del catálogo se contabilizan bien', () => {
    const catalog: AuthorizedVehicle[] = [{ plate: 'ABCD12', company: 'Sacyr' }];
    const plan = importVehicleCatalogCSV(catalog, 'ABCD-12,Sacyr\nEFGH-34,Domatica\nEFGH-34,Otro');
    expect(plan.newEntries).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
  });
});

describe('F) Normalización de patente', () => {
  it('normaliza con la misma regla que el resto de la app', () => {
    const r = parseVehicleCatalogCSV('tsxd-99,Sacyr');
    expect(r.rows[0].plate).toBe('TSXD99');
  });

  it('los 4 formatos de tsxd-99 producen la misma patente', () => {
    for (const v of ['tsxd-99', 'TSXD-99', 'TSXD 99', 'TSXD99']) {
      expect(parseVehicleCatalogCSV(`${v},Sacyr`).rows[0].plate).toBe('TSXD99');
    }
  });

  it('los 4 formatos se deduplican entre sí', () => {
    const r = parseVehicleCatalogCSV('tsxd-99,A\nTSXD-99,B\nTSXD 99,C\nTSXD99,D');
    expect(r.rows).toHaveLength(1);
    expect(r.duplicatesInFile).toBe(3);
  });

  it('una patente con formato inválido se marca inválida', () => {
    const r = parseVehicleCatalogCSV('XYZ,Sacyr');
    expect(r.rows).toHaveLength(0);
    expect(r.invalid).toHaveLength(1);
    expect(r.invalid[0].reason).toContain('Patente inválida');
  });

  it('una fila sin empresa se marca inválida', () => {
    const r = parseVehicleCatalogCSV('ABCD-12,');
    expect(r.invalid).toHaveLength(1);
    expect(r.invalid[0].reason).toBe('Empresa vacía');
  });
});

describe('G) Empresa asociada', () => {
  it('recorta espacios sobrantes', () => {
    expect(normalizeCompany('  Sacyr  ')).toBe('Sacyr');
  });

  it('colapsa espacios internos repetidos', () => {
    expect(normalizeCompany('Syc   Soluciones')).toBe('Syc Soluciones');
  });

  it('quita comillas envolventes', () => {
    expect(normalizeCompany('"Sacyr, Ltda"')).toBe('Sacyr, Ltda');
  });

  it('NO cambia el casing (son nombres propios)', () => {
    expect(normalizeCompany('SyC SOLUCIONES')).toBe('SyC SOLUCIONES');
  });

  it('conserva el empresa tal cual viene en el CSV', () => {
    const r = parseVehicleCatalogCSV('IJKL-56,Syc Soluciones');
    expect(r.rows[0].company).toBe('Syc Soluciones');
  });

  it('detecta el separador punto y coma', () => {
    expect(detectDelimiter('ABCD-12;Sacyr')).toBe(';');
    expect(detectDelimiter('ABCD-12,Sacyr')).toBe(',');
    expect(detectDelimiter('Empresa, con coma; y punto y coma')).toBe(',');
  });

  it('parsea CSV con punto y coma (Excel es-CL)', () => {
    const r = parseVehicleCatalogCSV('patente;empresa\nABCD-12;Sacyr');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].company).toBe('Sacyr');
  });
});

describe('H) Importación al catálogo existente', () => {
  it('agrega las nuevas al catálogo actual sin perder las previas', () => {
    const catalog: AuthorizedVehicle[] = [
      { plate: 'WWCC80', company: 'Domatica' },
      { plate: 'ABCD12', company: 'Sacyr' },
    ];
    const plan = importVehicleCatalogCSV(catalog, 'ABCD-12,Sacyr\nEFGH-34,Domatica');

    expect(plan.newCatalog).toHaveLength(3);
    expect(plan.newCatalog[0]).toEqual({ plate: 'WWCC80', company: 'Domatica' });
    expect(plan.newCatalog[1]).toEqual({ plate: 'ABCD12', company: 'Sacyr' });
    expect(plan.newCatalog[2]).toEqual({ plate: 'EFGH34', company: 'Domatica' });
  });

  it('NO muta el catálogo de entrada', () => {
    const catalog: AuthorizedVehicle[] = [{ plate: 'WWCC80', company: 'Domatica' }];
    importVehicleCatalogCSV(catalog, 'EFGH-34,Nueva');
    expect(catalog).toHaveLength(1);
  });

  it('importar sobre catálogo vacío deja exactamente las filas válidas', () => {
    const plan = importVehicleCatalogCSV([], 'ABCD-12,Sacyr\nEFGH-34,Domatica');
    expect(plan.newCatalog).toHaveLength(2);
    expect(plan.duplicates).toHaveLength(0);
  });

  it('el resumen cuadra: encontrados = nuevos + duplicados + inválidos', () => {
    const catalog: AuthorizedVehicle[] = [{ plate: 'ABCD12', company: 'Sacyr' }];
    const plan = importVehicleCatalogCSV(catalog, 'ABCD-12,Sacyr\nEFGH-34,Domatica\nIJKL-56,Syc\nXYZ,Mal');
    const total = plan.newEntries.length + plan.duplicates.length + plan.invalid.length;
    expect(total).toBe(plan.found);
  });
});

describe('I) Patente importada -> AUTORIZADO', () => {
  it('una patente importada resuelve AUTORIZADO con su empresa', () => {
    const plan = importVehicleCatalogCSV([], 'ABCD-12,Sacyr');
    const r = resolveAuthorization(plan.newCatalog, 'ABCD-12');
    expect(r.status).toBe('AUTORIZADO');
    expect(r.company).toBe('Sacyr');
  });

  it('funciona con cualquier formato de patente', () => {
    const plan = importVehicleCatalogCSV([], 'ABCD-12,Sacyr');
    for (const v of ['abcd-12', 'ABCD 12', 'ABCD12']) {
      expect(resolveAuthorization(plan.newCatalog, v).status).toBe('AUTORIZADO');
    }
  });
});

describe('J) Patente ausente -> NO REGISTRADO', () => {
  it('una patente no importada queda NO REGISTRADO', () => {
    const plan = importVehicleCatalogCSV([], 'ABCD-12,Sacyr');
    const r = resolveAuthorization(plan.newCatalog, 'ZZZZ-99');
    expect(r.status).toBe('NO REGISTRADO');
    expect(r.company).toBeNull();
  });

  it('con catálogo vacío TODAS las patentes son NO REGISTRADO', () => {
    expect(resolveAuthorization([], 'ABCD-12').status).toBe('NO REGISTRADO');
  });
});

describe('K) La importación NO toca sesiones ni historial', () => {
  it('planCatalogImport sólo devuelve catálogos: no recibe ni altera logs', () => {
    const catalog: AuthorizedVehicle[] = [];
    const plan = planCatalogImport(catalog, parseVehicleCatalogCSV('ABCD-12,Sacyr'));
    // El plan sólo habla de vehículos autorizados: no tiene ningún campo de
    // movimiento, sesión ni historial.
    expect(Object.keys(plan).sort()).toEqual(
      ['duplicates', 'found', 'invalid', 'newCatalog', 'newEntries'].sort()
    );
  });

  it('el catálogo NO guarda información de entrada/salida', () => {
    const plan = importVehicleCatalogCSV([], 'ABCD-12,Sacyr');
    for (const entry of plan.newCatalog) {
      expect(Object.keys(entry).sort()).toEqual(['company', 'plate']);
    }
  });
});
