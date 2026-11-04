import { describe, expect, test } from "bun:test";
import {
  create_kirlet_test_context,
  MemoryKirletDataClient,
  sign_kirlet_identity,
  sign_kirlet_identity_v2,
} from "@opus-perpetuus/imperium-core-kit";
import { SUBJECT } from "../../subject.ts";

// Soporterium (retest fase 4): el número y el nombre del llamante son PII.
// field-values solo con sesión interna; sin sesión o externo, 400 sin el dato.
const SECRET = "herr-fv-secret";
const base = { user_id: "u-1", email: "u@x.mx", is_admin: true, kirlet_id: SUBJECT.technical_id, grants: [] };

describe("herr-telefono/llamadas: field-values de PII solo con sesión", () => {
  test("numero, contacto_nombre y name: externo 400; interno 200; decision sin cambio", async () => {
    const data = new MemoryKirletDataClient(SUBJECT.schema());
    await data.insert("herr_telefono_llamadas", {
      id: "herr-llam-1",
      name: "Llamada de Ana",
      numero: "5550001111",
      contacto_nombre: "Ana López",
      decision: "aceptar",
      is_active: true,
    });
    const server = create_kirlet_test_context(SUBJECT, { data, auth_disabled: true, gateway_secret: SECRET });
    const externo = sign_kirlet_identity_v2({ ...base, user_type: "external", realm: "public" }, SECRET);
    const interno = sign_kirlet_identity(base, SECRET);
    const get = (f: string, headers: Record<string, string>) =>
      server.fetch(new Request(`http://t/herr-telefono/llamadas/field-values/${f}`, { headers }));
    for (const f of ["numero", "contacto_nombre", "name"]) {
      const res = await get(f, externo);
      const text = await res.text();
      expect([f, res.status]).toEqual([f, 400]);
      expect(text).not.toContain("5550001111");
      expect(text).not.toContain("Ana");
      expect([f, (await get(f, interno)).status]).toEqual([f, 200]);
    }
    expect((await get("decision", externo)).status).toBe(200);
    server.stop?.();
  });
});
