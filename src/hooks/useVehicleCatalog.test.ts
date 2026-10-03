import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVehicleCatalog } from './useVehicleCatalog';
import { resolveAuthorization } from '../domain/vehicleCatalog';
import { INITIAL_AUTHORIZED_VEHICLES } from '../data/mockVehicleCatalog';

describe('useVehicleCatalog — persistencia local', () => {
  it('siembra el catálogo inicial cuando no hay nada persistido', () => {
    localStorage.removeItem('securguard_vehicle_catalog_v1');
    const { result } = renderHook(() => useVehicleCatalog());
    expect(result.current.catalog).toEqual(INITIAL_AUTHORIZED_VEHICLES);
  });

  it('WWCC-80 aparece como AUTORIZADO → Domatica en la semilla', () => {
    localStorage.removeItem('securguard_vehicle_catalog_v1');
    const { result } = renderHook(() => useVehicleCatalog());
    const r = resolveAuthorization(result.current.catalog, 'WWCC-80');
    expect(r.status).toBe('AUTORIZADO');
    expect(r.company).toBe('Domatica');
  });

  it('ZZZZ-99 aparece como NO REGISTRADO en la semilla', () => {
    localStorage.removeItem('securguard_vehicle_catalog_v1');
    const { result } = renderHook(() => useVehicleCatalog());
    expect(resolveAuthorization(result.current.catalog, 'ZZZZ-99').status).toBe('NO REGISTRADO');
  });

  it('agrega una patente nueva y la consulta como AUTORIZADO', () => {
    localStorage.removeItem('securguard_vehicle_catalog_v1');
    const { result } = renderHook(() => useVehicleCatalog());

    act(() => {
      result.current.addVehicle('ZZZZ-99', 'Empresa Nueva');
    });

    const r = resolveAuthorization(result.current.catalog, 'ZZZZ-99');
    expect(r.status).toBe('AUTORIZADO');
    expect(r.company).toBe('Empresa Nueva');
  });

  it('normaliza la patente al agregar (tsxd-99 == TSXD99)', () => {
    localStorage.removeItem('securguard_vehicle_catalog_v1');
    const { result } = renderHook(() => useVehicleCatalog());

    act(() => {
      result.current.addVehicle('tsxd-99', 'Sugerida');
    });

    // TSXD99 ya estaba en la semilla → no debe duplicarse.
    const plates = result.current.catalog.map(v => v.plate);
    expect(plates.filter(p => p === 'TSXD99').length).toBe(1);
  });

  it('elimina una patente del catálogo', () => {
    localStorage.removeItem('securguard_vehicle_catalog_v1');
    const { result } = renderHook(() => useVehicleCatalog());

    act(() => {
      result.current.removeVehicle('WWCC-80');
    });

    expect(resolveAuthorization(result.current.catalog, 'WWCC-80').status).toBe('NO REGISTRADO');
  });
});