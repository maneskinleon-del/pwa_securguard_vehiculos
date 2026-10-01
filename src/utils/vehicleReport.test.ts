/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from "vitest";
import { buildVehicleReportCSV } from "./vehicleReport";
import { LogItem, ActiveCheckIn, GuardProfile } from "../types";
import { getLocalDateISO } from "../utils/datetime";

// Helper: create a vehicle entry log
const makeEntry = (id: string, plate: string, time: string, name = "Vehículo", entryTimestamp?: number): LogItem => ({
  id,
  name,
  rut: "",
  plate,
  type: "VEHICULO",
  action: "Entrada",
  time,
  date: getLocalDateISO(),
  unit: name !== "Vehículo" ? "Empresa: " + name : "Ingreso por patente",
  avatar: "",
  status: "active",
  entryTimestamp,
});

// Helper: create a vehicle exit log linked to an entry via entryId
const makeExit = (id: string, entryId: string, plate: string, time: string, entryTimestamp?: number): LogItem => ({
  id,
  name: "Vehículo",
  rut: "",
  plate,
  type: "VEHICULO",
  action: "Salida",
  time,
  date: getLocalDateISO(),
  unit: "Ingreso por patente",
  avatar: "",
  status: "exited",
  duration: "20m",
  entryId,
  entryTimestamp,
});

const profile: GuardProfile = { name: "Guardia Test", gate: "Obra Norte", soundAlerts: false, shift: "Manana", notifications: false, biometricValidation: false };

describe("buildVehicleReportCSV", () => {
  let logs: LogItem[];

  beforeEach(() => {
    logs = [];
  });

  // --- A) Entrada → Salida (debe producir 1 fila) ---
  it("A) Entrada → Salida produce 1 fila consolidada", () => {
    logs = [
      makeExit("exit-1", "entry-1", "BYJT99", "13:51", 1000),
      makeEntry("entry-1", "BYJT99", "13:31", "Reparto de agua para domatic", 1000),
    ];

    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const lines = csv.split("\r\n");
    // Filter out metadata lines (header section) to find data rows
    const dataRows = lines.filter(l => l.includes("BYJT"));
    expect(dataRows).toHaveLength(1);
    // Verify row contains: fecha, entrada, salida, empresa, patente, estado, permanencia
    const row = dataRows[0].split(",");
    expect(row).toContain("13:31"); // Hora Entrada
    expect(row).toContain("13:51"); // Hora Salida
    expect(row).toContain("Reparto de agua para domatic"); // Empresa
    expect(row).toContain("BYJT-99"); // Patente (formatted)
    expect(row).toContain("FUERA"); // Estado
    expect(row).toContain("20m"); // Permanencia (from exitLog.duration)
  });

  // --- B) Entrada → Salida → Entrada → Salida (debe producir 2 filas) ---
  it("B) Entrada → Salida → Entrada → Salida produce 2 filas, no 4", () => {
    logs = [
      makeExit("exit-2", "entry-2", "ABCD12", "14:30"),
      makeEntry("entry-2", "ABCD12", "14:10"),
      makeExit("exit-1", "entry-1", "ABCD12", "13:51"),
      makeEntry("entry-1", "ABCD12", "13:31"),
    ];

    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const rows = csv.split("\r\n").filter(l => l.includes("ABCD"));
    expect(rows).toHaveLength(2);
    // One row should have Salida=13:51, the other should have Salida=14:30
    expect(rows.some(r => r.includes("13:51"))).toBe(true);
    expect(rows.some(r => r.includes("14:30"))).toBe(true);
  });

  // --- C) Entrada sin Salida (debe producir 1 fila con estado DENTRO) ---
  it("C) Entrada sin Salida produce 1 fila con estado DENTRO", () => {
    logs = [makeEntry("entry-1", "ABCD12", "10:42", "Empresa X", Date.now() - 5 * 60000)];

    const active: ActiveCheckIn[] = [{
      id: "entry-1",
      name: "Empresa X",
      rut: "",
      plate: "ABCD12",
      type: "VEHICULO",
      unit: "Empresa: Empresa X",
      entryTime: "10:42",
      entryDate: getLocalDateISO(),
      entryTimestamp: Date.now() - 5 * 60000,
      avatar: "",
    }];

    const csv = buildVehicleReportCSV({ logs, activeInside: active, profile });
    const rows = csv.split("\r\n").filter(l => l.includes("ABCD"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("DENTRO");
    expect(rows[0]).not.toContain("FUERA");
  });

  // --- D) Dos vehículos distintos (cada uno como sesión independiente) ---
  it("D) Dos vehículos distintos aparecen como sesiones independientes", () => {
    logs = [
      makeExit("exit-2", "entry-2", "EFGH34", "11:00"),
      makeEntry("entry-2", "EFGH34", "10:47"),
      makeExit("exit-1", "entry-1", "BYJT99", "10:51"),
      makeEntry("entry-1", "BYJT99", "10:42"),
    ];

    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const rows = csv.split("\r\n").filter(l => l.includes("BYJT") || l.includes("EFGH"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("BYJT-99");
    expect(rows[1]).toContain("EFGH-34");
  });

  // --- E) Persistencia después de recargar (misma estructura, distinta data) ---
  it("E) CSV es determinístico sobre el mismo conjunto de logs", () => {
    logs = [
      makeExit("exit-1", "entry-1", "BYJT99", "13:51", 1000),
      makeEntry("entry-1", "BYJT99", "13:31", "Reparto de agua", 1000),
      makeEntry("entry-2", "ABCD12", "14:00", "Empresa Y"),
    ];

    const csv1 = buildVehicleReportCSV({ logs, activeInside: [], profile });
    // The data rows should be identical on re-export (only metadata timestamp changes)
    const data1 = csv1.split("\r\n").filter(l => l.includes("BYJT") || l.includes("ABCD"));
    const csv2 = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const data2 = csv2.split("\r\n").filter(l => l.includes("BYJT") || l.includes("ABCD"));
    expect(data1).toEqual(data2);
    // Should have both vehicles
    expect(data1.some(l => l.includes("BYJT"))).toBe(true);
    expect(data1.some(l => l.includes("ABCD"))).toBe(true);
    // BYJT99 should be FUERA, ABCD12 should be DENTRO
    const fueraRows = data1.filter(l => l.includes("BYJT") && l.includes("FUERA"));
    const dentroRows = data1.filter(l => l.includes("ABCD") && l.includes("DENTRO"));
    expect(fueraRows).toHaveLength(1);
    expect(dentroRows).toHaveLength(1);
  });

  // --- Filtro: solo vehículos (no interfiere con personas) ---
  it("Filtra solo sesiones VEHICULO, ignora sesiones de personas", () => {
    logs = [
      makeEntry("entry-1", "BYJT99", "13:31", "Empresa X"),
      { id: "person-1", name: "Juan", rut: "12345678-9", plate: undefined, type: "VISITANTE", action: "Entrada", time: "13:00", date: getLocalDateISO(), unit: "N/A", avatar: "", status: "active", entryTimestamp: 1000 },
    ];

    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const rows = csv.split("\r\n").filter(l => l.includes("BYJT") || l.includes("Juan"));
    expect(rows.some(r => r.includes("BYJT-99"))).toBe(true);
    expect(rows.some(r => r.includes("Juan"))).toBe(false);
  });

  // --- Empresa opcional: muestra "—" cuando no hay empresa ---
  it("Muestra '—' para empresa cuando el nombre es 'Vehículo'", () => {
    logs = [makeEntry("entry-1", "ABCD12", "10:42")];
    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const rows = csv.split("\r\n").filter(l => l.includes("ABCD"));
    expect(rows[0]).toContain("—");
  });

  // --- CSV es RFC 4180: escaping de comas y comillas ---
  it("RFC 4180: escapa correctamente campos con comas", () => {
    logs = [makeEntry("entry-1", "ABCD12", "10:42", "Empresa, con coma")];
    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const rows = csv.split("\r\n").filter(l => l.includes("ABCD"));
    // The company name with a comma should be properly quoted
    expect(rows[0]).toContain('"Empresa, con coma"');
  });

  // --- Metadata header ---
  it("Incluye metadata de guardia y conteos", () => {
    logs = [makeEntry("entry-1", "ABCD12", "10:42", "Empresa X")];
    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    expect(csv).toContain("Reporte de Control Vehicular de Acceso");
    expect(csv).toContain("Guardia a Cargo:");
    expect(csv).toContain("Guardia Test");
    expect(csv).toContain("Punto de Control:,Obra Norte");
    expect(csv).toContain("Total de Sesiones Vehiculares:,1");
  });
});
