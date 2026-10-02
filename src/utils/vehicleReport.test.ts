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

  // --- L) CSV existente sigue consolidando Entrada + Salida en UNA fila ---
  it("L) consolida Entrada + Salida en una única fila por sesión (entryId)", () => {
    logs = [
      makeExit("exit-1", "entry-1", "BYJT99", "13:51", 1000),
      makeEntry("entry-1", "BYJT99", "13:31", "Reparto de agua para domatic", 1000),
    ];
    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const rows = csv.split("\r\n").filter(l => l.includes("BYJT"));
    expect(rows).toHaveLength(1); // 1 fila, NO 2
    const cells = rows[0].split(",");
    expect(cells).toHaveLength(9); // 7 originales + Tipo de Salida + Observación
    expect(cells[0]).toBe(getLocalDateISO());          // Fecha
    expect(cells[1]).toBe("13:31");                    // Hora Entrada
    expect(cells[2]).toBe("13:51");                    // Hora Salida
    expect(cells[3]).toBe("Reparto de agua para domatic"); // Empresa
    expect(cells[4]).toBe("BYJT-99");                  // Patente
    expect(cells[5]).toBe("FUERA");                    // Estado
    expect(cells[6]).toBe("20m");                      // Permanencia
  });

  // --- Ampliación mínima: columnas nuevas + salida normal marcada ---
  it("añade 'Tipo de Salida' y 'Observación' sin alterar las 7 columnas originales", () => {
    logs = [
      makeExit("exit-1", "entry-1", "BYJT99", "13:51", 1000),
      makeEntry("entry-1", "BYJT99", "13:31", "Empresa X", 1000),
    ];
    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const header = csv.split("\r\n").find(l => l.startsWith("Fecha,"));
    expect(header).toBe(
      "Fecha,Hora Entrada,Hora Salida,Empresa,Patente,Estado,Permanencia,Tipo de Salida,Observación"
    );
    const row = csv.split("\r\n").filter(l => l.includes("BYJT"))[0];
    expect(row.split(",")[7]).toBe("Salida normal"); // Tipo de Salida
    expect(row.split(",")[8]).toBe("—");             // Observación (sin observación)
  });

  // --- SALIDA DIRECTA: fila propia, sin hora de entrada inventada ---
  it("SALIDA DIRECTA se exporta como fila propia con entrada '—' y tipo 'Salida directa'", () => {
    const directExit: LogItem = {
      id: "exit-direct-1",
      name: "Sacyr",
      rut: "",
      plate: "ABCD12",
      type: "VEHICULO",
      unit: "Empresa: Sacyr",
      action: "Salida",
      time: "16:40",
      date: getLocalDateISO(),
      status: "exited",
      avatar: "",
      directExit: true,
      exitType: "Vacío",
      observation: "Entrada registrada en otra portería",
    };
    logs = [directExit];

    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const rows = csv.split("\r\n").filter(l => l.includes("ABCD"));
    expect(rows).toHaveLength(1);

    const cells = rows[0].split(",");
    expect(cells[0]).toBe(getLocalDateISO());        // Fecha
    expect(cells[1]).toBe("—");                      // Hora Entrada: NUNCA inventada
    expect(cells[2]).toBe("16:40");                  // Hora Salida
    expect(cells[3]).toBe("Sacyr");                  // Empresa
    expect(cells[4]).toBe("ABCD-12");                // Patente
    expect(cells[5]).toBe("FUERA");                  // Estado
    expect(cells[6]).toBe("—");                      // Permanencia
    expect(cells[7]).toBe("Salida directa");         // Tipo de Salida
    expect(cells[8]).toBe("Entrada registrada en otra portería"); // Observación
  });

  it("SALIDA DIRECTA no crea una fila de entrada ficticia", () => {
    logs = [{
      id: "exit-direct-1", name: "Vehículo", rut: "", plate: "ABCD12", type: "VEHICULO",
      unit: "Salida sin entrada local", action: "Salida", time: "16:40",
      date: getLocalDateISO(), status: "exited", avatar: "", directExit: true,
    }];
    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    // Solo una fila con ABCD (la de la salida directa), ninguna Entrada implícita
    expect(csv.split("\r\n").filter(l => l.includes("ABCD"))).toHaveLength(1);
    expect(csv).toContain("Salidas Directas (sin entrada local):,1");
  });

  it("la observación de una salida normal se exporta en su fila consolidada", () => {
    const exit = makeExit("exit-1", "entry-1", "BYJT99", "13:51", 1000);
    exit.observation = "No entrega nombre del conductor";
    exit.exitType = "Con carga / materiales";
    logs = [exit, makeEntry("entry-1", "BYJT99", "13:31", "Sacyr", 1000)];

    const csv = buildVehicleReportCSV({ logs, activeInside: [], profile });
    const cells = csv.split("\r\n").filter(l => l.includes("BYJT"))[0].split(",");
    expect(cells[7]).toBe("Con carga / materiales");
    expect(cells[8]).toBe("No entrega nombre del conductor");
    expect(cells).toHaveLength(9); // sigue siendo una única fila
  });
});
