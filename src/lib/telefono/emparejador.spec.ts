import { describe, expect, test } from "bun:test";
import { identificar_por_nombre, parece_numero, type Contacto } from "./emparejador.ts";

const agenda: Contacto[] = [
  { clave: "k1", nombre: "Rafael Muñoz", telefono: "+525512345678" },
  { clave: "k2", nombre: "María González", telefono: "+525587654321" },
];

describe("identificar_por_nombre", () => {
  test("título idéntico al nombre del contacto lo identifica", () => {
    expect(identificar_por_nombre("Rafael Muñoz", agenda)).toEqual({
      conocido: true,
      clave: "k1",
      nombre: "Rafael Muñoz",
      numero: "+525512345678",
    });
  });

  test("el match ignora mayúsculas, acentos y espacios de más", () => {
    expect(identificar_por_nombre("  maria   gonzalez ", agenda).clave).toBe("k2");
  });

  test("nombre fuera de la agenda es desconocido pero conserva cómo locutarlo", () => {
    expect(identificar_por_nombre("Juan Pérez", agenda)).toEqual({ conocido: false, nombre: "Juan Pérez" });
  });

  test("título con pinta de número es desconocido y se guarda como número", () => {
    for (const titulo of ["+52 55 1234 5678", "5512345678", "(55) 1234-5678"]) {
      expect(parece_numero(titulo)).toBe(true);
      expect(identificar_por_nombre(titulo, agenda)).toEqual({ conocido: false, numero: titulo });
    }
    expect(parece_numero("Rafael 2")).toBe(false);
  });

  test("título vacío o nulo es desconocido sin número", () => {
    expect(identificar_por_nombre(null, agenda)).toEqual({ conocido: false });
    expect(identificar_por_nombre("  ", agenda)).toEqual({ conocido: false });
  });

  test("agenda vacía: todo el mundo es desconocido", () => {
    expect(identificar_por_nombre("Rafael Muñoz", []).conocido).toBe(false);
  });
});
