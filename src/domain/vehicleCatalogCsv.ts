/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Domain layer: IMPORTACIÓN MASIVA de patentes desde CSV.
 *
 * Formato soportado (simple y deliberado):
 *
 *     patente,empresa
 *     ABCD-12,Sacyr
 *     EFGH-34,Domatica
 *
 * Reglas:
 *  - El delimitador puede ser `,` o `;` (en es-CL ExcelOften exports `;`).
 *    Se detecta automáticamente desde la primera línea con datos.
 *  - El encabezado es OPCIONAL y se detecta por nombre de columna.
 *  - Las líneas vacías se ignoran.
 *  - La patente se normaliza con `normalizePlate` (MISMA función que usa el
 *    resto de la app) y se valida con `isValidPlate`.
 *  - La empresa se normaliza recortando, quitando comillas y colapsando
 *    espacios; NO se cambia el casing (son nombres propios: "Sacyr").
 *  - Los duplicados DENTRO del archivo se descartan (gana la primera fila).
 *  - RFC 4180 básico: campos entre comillas con comas internas permitidas.
 *
 * IMPORTANTE — este módulo es PURO: no escribe nada. Devuelve un PLAN que la
 * UI muestra para confirmación y que recién después se aplica sobre el
 * catálogo existente (`useVehicleCatalog`). No crea una base paralela.
 */

import { AuthorizedVehicle } from './vehicleCatalog';
import { normalizePlate, isValidPlate } from './plate';

/** Fila válida del CSV, ya normalizada. */
export interface ParsedVehicleRow {
  plate: string;
  company: string;
  /** Número de línea (1-based) en el archivo original, para reportar. */
  line: number;
}

/** Línea rechazada, con el motivo, para poder mostrárselo al usuario. */
export interface CsvParseProblem {
  line: number;
  raw: string;
  reason: string;
}

/** Resultado del análisis del CSV (sin escribir nada). */
export interface CsvParseResult {
  /** Filas válidas y deduplicadas, listas para importar. */
  rows: ParsedVehicleRow[];
  /** Registros con datos encontrados (sin contar el encabezado). */
  found: number;
  /** Filas inválidas (patente o empresa incorrectas). */
  invalid: CsvParseProblem[];
  /** Duplicados INTERNOS del mismo archivo (la primeraoccurrence gana). */
  duplicatesInFile: number;
  /** `true` si se detectó y respetó una línea de encabezado. */
  hasHeader: boolean;
}

/** Plan de importación: qué se agregaría al catálogo actual. */
export interface CatalogImportPlan {
  /** Catálogo resultante (actual + nuevos). No muta el catálogo de entrada. */
  newCatalog: AuthorizedVehicle[];
  /** Entradas realmente nuevas. */
  newEntries: AuthorizedVehicle[];
  /** Filas cuya patente YA existe en el catálogo (no se agregan). */
  duplicates: ParsedVehicleRow[];
  /** Filas inválidas. */
  invalid: CsvParseProblem[];
  found: number;
}

/** Encabezados aceptados para la columna de patente. */
const PLATE_HEADERS = new Set(['patente', 'patentes', 'placa', 'ppu', 'patentevehiculo']);

/** Encabezados aceptados para la columna de empresa. */
const COMPANY_HEADERS = new Set(['empresa', 'razonsocial', 'razon', 'proveedor', 'cliente']);

/** Quita acentos y pasa a minúsculas, para comparar encabezados. */
function foldHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Normaliza una empresa: quita comillas envolventes, colapsa espacios
 * repetidos y recorta. Conserva el casing original.
 */
export function normalizeCompany(input: string | undefined | null): string {
  if (input == null) return '';
  let s = String(input).trim();
  // Quita comillas envolventes ("Sacyr, Ltda" → Sacyr, Ltda)
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Divide una línea CSV en celdas respetando comillas RFC 4180.
 * `delimiter` permite `,` o `;`.
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'; // comilla escapada ""
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  cells.push(current);
  return cells;
}

/**
 * Detecta el delimitador de la primera línea con datos.
 * Usa `;` sólo si hay `;` y NO hay `,` (evita romper empresas con coma).
 */
export function detectDelimiter(line: string): string {
  return line.includes(';') && !line.includes(',') ? ';' : ',';
}

/**
 * Analiza un CSV de vehículos y devuelve filas válidas + reporte.
 * NO escribe nada: es una vista previa previa a la confirmación.
 */
export function parseVehicleCatalogCSV(text: string): CsvParseResult {
  const rows: ParsedVehicleRow[] = [];
  const invalid: CsvParseProblem[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;
  let found = 0;
  let hasHeader = false;
  let delimiter = ',';

  const clean = String(text ?? '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r\n|\n|\r/);

  // Se procesa la primera línea con datos para detectar delimitador/encabezado.
  const firstDataIndex = lines.findIndex(l => l.trim() !== '');
  if (firstDataIndex >= 0) {
    delimiter = detectDelimiter(lines[firstDataIndex]);
    const firstCells = splitCsvLine(lines[firstDataIndex], delimiter);
    const firstKey = foldHeader(firstCells[0] ?? '');
    if (PLATE_HEADERS.has(firstKey) || COMPANY_HEADERS.has(firstKey)) {
      hasHeader = true;
    }
  }

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;

    // (D) Líneas vacías: se ignoran por completo.
    if (rawLine.trim() === '') return;

    // (C) Encabezado: se respeta y no cuenta como registro.
    if (hasHeader && lineNumber === firstDataIndex + 1) return;

    const cells = splitCsvLine(rawLine, delimiter);
    const plateRaw = cells[0] ?? '';
    const companyRaw = cells[1] ?? '';

    // Línea totalmente vacía tras dividir (ej. sólo separadores).
    if (plateRaw.trim() === '' && companyRaw.trim() === '') return;

    found++;

    const plate = normalizePlate(plateRaw);
    const company = normalizeCompany(companyRaw);

    if (plate === '') {
      invalid.push({ line: lineNumber, raw: rawLine, reason: 'Patente vacía' });
      return;
    }
    if (!isValidPlate(plate)) {
      invalid.push({ line: lineNumber, raw: rawLine, reason: `Patente inválida: ${plateRaw.trim()}` });
      return;
    }
    if (company === '') {
      invalid.push({ line: lineNumber, raw: rawLine, reason: 'Empresa vacía' });
      return;
    }

    // (E) Duplicados dentro del mismo archivo: gana la primera fila.
    if (seen.has(plate)) {
      duplicatesInFile++;
      return;
    }
    seen.add(plate);
    rows.push({ plate, company, line: lineNumber });
  });

  return { rows, found, invalid, duplicatesInFile, hasHeader };
}

/**
 * Calcula el plan de importación contra el catálogo ACTUAL.
 *
 * Semántica de duplicados (consistente con `addVehicle` del hook):
 * si la patente YA existe en el catálogo, NO se crea otra entrada y NO se
 * sobrescribe la empresa — la primera empresa registrada manda.
 *
 * El catálogo de entrada NO se muta.
 */
export function planCatalogImport(
  currentCatalog: readonly AuthorizedVehicle[],
  parsed: CsvParseResult
): CatalogImportPlan {
  const existing = new Set(currentCatalog.map(v => normalizePlate(v.plate)));
  const newEntries: AuthorizedVehicle[] = [];
  const duplicates: ParsedVehicleRow[] = [];

  for (const row of parsed.rows) {
    if (existing.has(row.plate)) {
      duplicates.push(row);
      continue;
    }
    existing.add(row.plate);
    newEntries.push({ plate: row.plate, company: row.company });
  }

  return {
    newCatalog: [...currentCatalog, ...newEntries],
    newEntries,
    duplicates,
    invalid: parsed.invalid,
    found: parsed.found,
  };
}

/** Atajo: parsea el CSV y devuelve directamente el plan de importación. */
export function importVehicleCatalogCSV(
  currentCatalog: readonly AuthorizedVehicle[],
  text: string
): CatalogImportPlan {
  return planCatalogImport(currentCatalog, parseVehicleCatalogCSV(text));
}
