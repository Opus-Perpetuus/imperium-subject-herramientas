import { describe, expect, test } from "bun:test";
import {
  distancia_m,
  enlace_como_llegar,
  enlace_ver,
  formato_geo,
  geo_uri,
  leer_geo,
  punto_valido,
} from "./geo.ts";

const cdmx = { lat: 19.4326, lon: -99.1332 };

describe("geo", () => {
  test("haversine mide un grado de latitud sobre la esfera", () => {
    expect(distancia_m({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -2);
    expect(distancia_m(cdmx, cdmx)).toBe(0);
  });

  test("formato con punto y seis decimales", () => {
    expect(formato_geo(cdmx)).toBe("19.432600,-99.133200");
    expect(formato_geo({ lat: 0.0000014, lon: 0 })).toBe("0.000001,0.000000");
  });

  test("lectura tolerante y con rechazo fuera del planeta", () => {
    expect(leer_geo(formato_geo(cdmx))).toEqual({ lat: 19.4326, lon: -99.1332 });
    expect(leer_geo("  19.4326 , -99.1332 ")).toEqual({ lat: 19.4326, lon: -99.1332 });
    expect(leer_geo(null)).toBeNull();
    expect(leer_geo("")).toBeNull();
    expect(leer_geo("por ahí por el centro")).toBeNull();
    expect(leer_geo("19.4326")).toBeNull();
    expect(leer_geo("95.0,-99.1")).toBeNull();
    expect(leer_geo("19.4,-200.0")).toBeNull();
    expect(punto_valido("19", -99)).toBeNull();
  });

  test("enlaces sin API key", () => {
    expect(enlace_ver(cdmx)).toBe(
      "https://www.google.com/maps/search/?api=1&query=19.432600%2C-99.133200",
    );
    expect(enlace_como_llegar(cdmx)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=19.432600%2C-99.133200&travelmode=two_wheeler",
    );
    const uri = geo_uri(cdmx, "Morelos 45");
    expect(uri.startsWith("geo:19.432600,-99.133200?q=")).toBe(true);
    expect(uri.includes(" ")).toBe(false);
    expect(geo_uri(cdmx, null)).toBe("geo:19.432600,-99.133200?q=19.432600,-99.133200");
  });
});
