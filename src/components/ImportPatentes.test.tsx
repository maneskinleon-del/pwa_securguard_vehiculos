/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pruebas de UI de la sección administrativa "IMPORTAR PATENTES".
 *
 * Cubren el flujo real: seleccionar CSV → resumen → confirmar → catálogo.
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ImportPatentes } from './ImportPatentes';
import { AuthorizedVehicle, resolveAuthorization } from '../domain/vehicleCatalog';
import { importVehicleCatalogCSV } from '../domain/vehicleCatalogCsv';

/**
 * Construye un archivo CSV simulado. jsdom no implementa File#text en todas
 * sus versiones, por eso se entrega un objeto equivalente con `text()`.
 */
function csvFile(name: string, content: string): File {
  const file = {
    name,
    text: () => Promise.resolve(content),
  };
  return file as unknown as File;
}

/** Renderiza el componente con un catálogo controlado y captura las escrituras. */
function setup(catalog: AuthorizedVehicle[] = []) {
  let current = catalog;
  const onImport = vi.fn((entries: AuthorizedVehicle[]) => {
    current = [...current, ...entries];
    return entries.length;
  });

  const view = render(
    <ImportPatentes catalog={current} onImport={onImport} onBack={() => {}} />
  );
  return { onImport, view, getCatalog: () => current };
}

/** Selecciona un archivo en el input y espera el resumen. */
async function selectFile(file: File) {
  fireEvent.change(screen.getByTestId('csv-input'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByTestId('import-summary')).toBeDefined());
}

describe('ImportPatentes — pantalla', () => {
  beforeEach(() => cleanup());

  it('muestra el título IMPORTAR PATENTES', () => {
    setup();
    expect(screen.getByText(/Importar Patentes/i)).toBeDefined();
  });

  it('ofrece un selector de archivo CSV', () => {
    setup();
    expect(screen.getByTestId('csv-input')).toBeDefined();
  });

  it('documenta el formato patente,empresa', () => {
    setup();
    // Aparece en el subtítulo y en la ayuda de formato.
    expect(screen.getAllByText(/patente,empresa/i).length).toBeGreaterThan(0);
  });

  it('con catálogo vacío lo indica y muestra el contador en 0', () => {
    setup();
    expect(screen.getByTestId('catalog-count').textContent).toBe('0');
    expect(screen.getByText(/El catálogo está vacío/i)).toBeDefined();
  });
});

describe('ImportPatentes — resumen antes de confirmar', () => {
  beforeEach(() => cleanup());

  it('muestra encontrados, nuevos, duplicados e inválidos', async () => {
    setup([{ plate: 'ABCD12', company: 'Sacyr' }]);

    await selectFile(
      csvFile(
        'vehiculos.csv',
        ['patente,empresa', 'ABCD-12,Sacyr', 'EFGH-34,Domatica', 'IJKL-56,Syc', 'XYZ,Mal'].join('\n')
      )
    );

    expect(screen.getByTestId('stat-found').textContent).toBe('4');
    expect(screen.getByTestId('stat-new').textContent).toBe('2');
    expect(screen.getByTestId('stat-dup').textContent).toBe('1');
    expect(screen.getByTestId('stat-invalid').textContent).toBe('1');
  });

  it('muestra el nombre del archivo seleccionado', async () => {
    setup();
    await selectFile(csvFile('vehiculos_prueba.csv', 'ABCD-12,Sacyr'));
    expect(screen.getByText('vehiculos_prueba.csv')).toBeDefined();
  });

  it('NO escribe nada en el catálogo antes de confirmar', async () => {
    const { onImport } = setup();
    await selectFile(csvFile('v.csv', 'ABCD-12,Sacyr\nEFGH-34,Domatica'));
    expect(onImport).not.toHaveBeenCalled();
  });

  it('CSV vacío muestra el resumen con todos los contadores en 0', async () => {
    setup();
    await selectFile(csvFile('vacio.csv', ''));
    expect(screen.getByTestId('stat-found').textContent).toBe('0');
    expect(screen.getByTestId('stat-new').textContent).toBe('0');
  });

  it('el botón Importar se deshabilita si no hay nada nuevo', async () => {
    setup([{ plate: 'ABCD12', company: 'Sacyr' }]);
    await selectFile(csvFile('dup.csv', 'ABCD-12,Sacyr'));
    const btn = screen.getByText('Importar').closest('button');
    expect(btn?.disabled).toBe(true);
  });
});

describe('ImportPatentes — confirmar importación', () => {
  beforeEach(() => cleanup());

  it('importa al confirmar y muestra confirmación', async () => {
    const { onImport } = setup();

    await selectFile(
      csvFile('v.csv', 'patente,empresa\nABCD-12,Sacyr\nEFGH-34,Domatica\nIJKL-56,Syc Soluciones')
    );

    fireEvent.click(screen.getByText('Importar').closest('button')!);

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledWith([
      { plate: 'ABCD12', company: 'Sacyr' },
      { plate: 'EFGH34', company: 'Domatica' },
      { plate: 'IJKL56', company: 'Syc Soluciones' },
    ]);
    await waitFor(() => expect(screen.getByTestId('import-done')).toBeDefined());
    expect(screen.getByTestId('import-done').textContent).toContain('3');
  });

  it('Cancelar no importa nada', async () => {
    const { onImport } = setup();
    await selectFile(csvFile('v.csv', 'ABCD-12,Sacyr'));

    fireEvent.click(screen.getByText('Cancelar').closest('button')!);

    expect(onImport).not.toHaveBeenCalled();
    expect(screen.queryByTestId('import-summary')).toBeNull();
  });
});

describe('ImportPatentes — catálogo actual visible (comprobación de carga)', () => {
  beforeEach(() => cleanup());

  it('lista patente y empresa del catálogo actual', () => {
    setup([
      { plate: 'ABCD12', company: 'Sacyr' },
      { plate: 'EFGH34', company: 'Domatica' },
    ]);
    expect(screen.getByText('ABCD-12')).toBeDefined();
    expect(screen.getByText('Sacyr')).toBeDefined();
    expect(screen.getByText('EFGH-34')).toBeDefined();
    expect(screen.getByText('Domatica')).toBeDefined();
    expect(screen.getByTestId('catalog-count').textContent).toBe('2');
  });

  it('una patente importada queda AUTORIZADO (I)', () => {
    const { getCatalog } = setup();
    const plan = importVehicleCatalogCSV(getCatalog(), 'ABCD-12,Sacyr');

    expect(plan.newEntries).toHaveLength(1);

    const catalog = [...getCatalog(), ...plan.newEntries];
    const r = resolveAuthorization(catalog, 'ABCD-12');
    expect(r.status).toBe('AUTORIZADO');
    expect(r.company).toBe('Sacyr');
  });

  it('una patente ausente del CSV queda NO REGISTRADO y no se bloquea (J)', () => {
    const { getCatalog } = setup();
    const plan = importVehicleCatalogCSV(getCatalog(), 'ABCD-12,Sacyr');
    const catalog = [...getCatalog(), ...plan.newEntries];

    const ausente = resolveAuthorization(catalog, 'ZZZZ-99');
    expect(ausente.status).toBe('NO REGISTRADO');
    // NO REGISTRADO es informativo: la UI no recibe ningún flag de bloqueo.
    expect(ausente).not.toHaveProperty('blocked');
    expect(ausente).not.toHaveProperty('allowed');
  });
});
