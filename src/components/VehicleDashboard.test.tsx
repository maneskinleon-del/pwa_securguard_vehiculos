/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pruebas de UI de la pantalla ÚNICA de Control de Acceso vehicular.
 *
 * Verifican los requisitos de UX del enunciado:
 *   - las tres secciones viven dentro de Control de Acceso
 *   - no existe tab Personas ni registro de choferes
 *   - Últimos Movimientos está LIMITADO (no crece indefinidamente)
 *   - estado AUTORIZADO visible / estado NO REGISTRADO visible
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { VehicleDashboard, VehicleDashboardProps } from './VehicleDashboard';
import { LogItem, ActiveCheckIn, GuardProfile, IncidentReport } from '../types';
import { AuthorizedVehicle } from '../domain/vehicleCatalog';

const CATALOG: AuthorizedVehicle[] = [
  { plate: 'WWCC80', company: 'Domatica' },
  { plate: 'HHCC29', company: 'Sacyr' },
];

const PROFILE: GuardProfile = {
  name: 'Guardia Prueba',
  gate: 'Obra Norte',
  shift: 'Noche',
  notifications: false,
  soundAlerts: false,
  biometricValidation: false,
};

const noop = () => {};

function baseProps() {
  return {
    logs: [] as LogItem[],
    activeInside: [] as ActiveCheckIn[],
    catalog: CATALOG,
    profile: PROFILE,
    incidents: [] as IncidentReport[],
    isVehicleInside: () => false,
    // El cast explícito mantiene el discriminante `ok: true` literal exigido por
    // las uniones discriminadas VehicleEntryResult / VehicleDirectExitResult.
    onVehicleEntry: (() => ({ ok: true, log: {} as LogItem })) as VehicleDashboardProps['onVehicleEntry'],
    onVehicleExit: () => true,
    onVehicleDirectExit: (() => ({
      ok: true,
      log: {} as LogItem,
    })) as VehicleDashboardProps['onVehicleDirectExit'],
    onRemoveMovement: noop,
    clock: '09:30',
    onShowToast: noop,
    onOpenSettings: noop,
  };
}

/** Construye un log vehicular de entrada. */
function entryLog(id: string, plate: string, company: string, time: string): LogItem {
  return {
    id,
    name: company,
    rut: '',
    plate,
    type: 'VEHICULO',
    action: 'Entrada',
    time,
    date: '2026-08-04',
    unit: `Empresa: ${company}`,
    status: 'active',
  };
}

describe('VehicleDashboard — estructura de Control de Acceso', () => {
  beforeEach(() => cleanup());

  it('muestra la sección de registro de movimiento', () => {
    render(<VehicleDashboard {...baseProps()} />);
    expect(screen.getByText(/Control de Acceso Vehicular/i)).toBeDefined();
  });

  it('muestra PATENTE, EMPRESA y los botones de movimiento', () => {
    render(<VehicleDashboard {...baseProps()} />);
    expect(screen.getByText('PATENTE')).toBeDefined();
    expect(screen.getByText(/EMPRESA/)).toBeDefined();
    expect(screen.getByText('ENTRADA')).toBeDefined();
    // Sin sesión abierta, la salida ofrecida es SALIDA DIRECTA.
    expect(screen.getByText('SALIDA DIRECTA')).toBeDefined();
  });

  it('Vehículos Dentro aparece dentro de Control de Acceso', () => {
    render(<VehicleDashboard {...baseProps()} />);
    expect(screen.getByText(/Vehículos Dentro/i)).toBeDefined();
  });

  it('Últimos Movimientos aparece dentro de Control de Acceso', () => {
    render(<VehicleDashboard {...baseProps()} />);
    expect(screen.getByText(/Últimos Movimientos/i)).toBeDefined();
  });

  it('no existe tab Personas ni registro de choferes', () => {
    render(<VehicleDashboard {...baseProps()} />);
    const html = document.body.innerHTML.toLowerCase();
    expect(html).not.toContain('personas');
    expect(html).not.toContain('chofer');
    expect(screen.queryByText('Personas')).toBeNull();
    expect(screen.queryByText(/chofer/i)).toBeNull();
  });
});

describe('VehicleDashboard — estado de autorización', () => {
  beforeEach(() => cleanup());

  it('una patente del catálogo muestra AUTORIZADO', () => {
    render(<VehicleDashboard {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText('ABCD12'), { target: { value: 'WWCC-80' } });
    expect(screen.getByTestId('vehicle-auth-badge').textContent).toBe('AUTORIZADO');
  });

  it('una patente inexistente muestra NO REGISTRADO', () => {
    render(<VehicleDashboard {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText('ABCD12'), { target: { value: 'ZZZZ-99' } });
    expect(screen.getByTestId('vehicle-auth-badge').textContent).toBe('NO REGISTRADO');
  });

  it('el estado AUTORIZADO muestra la empresa del catálogo', () => {
    render(<VehicleDashboard {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText('ABCD12'), { target: { value: 'WWCC-80' } });
    const panel = screen.getByTestId('vehicle-auth-status');
    expect(panel.textContent).toContain('Domatica');
    expect(panel.textContent).toContain('WWCC-80');
  });

  it('NO REGISTRADO no bloquea los botones de movimiento', () => {
    render(<VehicleDashboard {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText('ABCD12'), { target: { value: 'ZZZZ-99' } });

    const entrada = screen.getByText('ENTRADA').closest('button');
    const directa = screen.getByText('SALIDA DIRECTA').closest('button');

    expect(entrada?.disabled).toBe(false);
    expect(directa?.disabled).toBe(false);
  });

  it('la normalización de patente funciona también en la UI', () => {
    const withCatalog: AuthorizedVehicle[] = [...CATALOG, { plate: 'TSXD99', company: 'Transportes Sur' }];
    render(<VehicleDashboard {...baseProps()} catalog={withCatalog} />);
    const input = screen.getByPlaceholderText('ABCD12');

    for (const variant of ['tsxd-99', 'TSXD-99', 'TSXD 99', 'TSXD99']) {
      fireEvent.change(input, { target: { value: variant } });
      expect(screen.getByTestId('vehicle-auth-badge').textContent).toBe('AUTORIZADO');
    }
  });
});

describe('VehicleDashboard — vehículos dentro y últimos movimientos', () => {
  beforeEach(() => cleanup());

  it('Vehículos Dentro lista patente, empresa y hora de entrada', () => {
    const activeInside: ActiveCheckIn[] = [
      {
        id: 'a1',
        name: 'Domatica',
        rut: '',
        plate: 'WWCC80',
        type: 'VEHICULO',
        unit: 'Empresa: Domatica',
        entryTime: '09:17',
        entryDate: '2026-08-04',
        entryTimestamp: Date.now() - 60000,
      },
    ];
    render(<VehicleDashboard {...baseProps()} activeInside={activeInside} />);
    expect(screen.getByText('WWCC-80')).toBeDefined();
    expect(screen.getByText('Domatica')).toBeDefined();
    expect(screen.getByText('09:17')).toBeDefined();
  });

  it('Últimos Movimientos está LIMITADO: no crece con muchos movimientos', () => {
    const logs: LogItem[] = [];
    for (let i = 0; i < 40; i++) {
      logs.push(entryLog(`log-${i}`, 'ABCD12', `Empresa ${i}`, '09:00'));
    }
    render(<VehicleDashboard {...baseProps()} logs={logs} />);

    // El límite de la sección es 8, no 40.
    expect(screen.getAllByText('ABCD-12').length).toBe(8);
  });

  it('el historial completo NO domina la UI pero el CSV sigue disponible', () => {
    render(<VehicleDashboard {...baseProps()} />);
    expect(screen.getByText('CSV')).toBeDefined();
  });
});
