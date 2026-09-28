import { describe, expect, test } from "bun:test";
import { MemoryKirletDataClient } from "@opus-perpetuus/imperium-core-kit";
import { nombre_vehiculo } from "./externo.ts";

const ENV = {
  CORE_DATA_URL: "http://core:3100",
  SUBJECT_TECHNICAL_ID: "subject-herramientas",
  CORE_SUBJECT_GATEWAY_SECRET: "derivado",
};

function fake_fetch(status: number, body: unknown) {
  const urls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

describe("nombre_vehiculo", () => {
  const ctx = () => ({ data: new MemoryKirletDataClient() });

  test("sin gateway configurado cae al snapshot, a los ajustes guardados o al id", async () => {
    const c = ctx();
    expect(await nombre_vehiculo(c, "veh1", "Moto Roja", { env: {} })).toBe("Moto Roja");
    expect(await nombre_vehiculo(c, "veh1", undefined, { env: {} })).toBe("veh1");
    await c.data.insert("herr_vehiculos", { id: "aj1", vehiculo_id: "veh1", name: "Guardada" });
    expect(await nombre_vehiculo(c, "veh1", "", { env: {} })).toBe("Guardada");
  });

  test("con gateway devuelve el nombre remoto", async () => {
    const { fetchImpl, urls } = fake_fetch(200, { data: { name: "Italika FT150", placas: "ABC-12" } });
    expect(await nombre_vehiculo(ctx(), "veh 1", "Snapshot", { env: ENV, fetchImpl })).toBe("Italika FT150");
    expect(urls).toEqual(["http://core:3100/api/m/subject-vehiculos/vehicle/veh%201"]);
  });

  test("si el vehículo no existe o falla la llamada, snapshot", async () => {
    const no = fake_fetch(404, { error: "not_found", message: "not found" });
    expect(await nombre_vehiculo(ctx(), "veh1", "Snapshot", { env: ENV, fetchImpl: no.fetchImpl })).toBe("Snapshot");
    const vacio = fake_fetch(200, { data: { name: "" } });
    expect(await nombre_vehiculo(ctx(), "veh1", "Snapshot", { env: ENV, fetchImpl: vacio.fetchImpl })).toBe("Snapshot");
  });
});
