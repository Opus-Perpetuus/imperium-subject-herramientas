import { describe, expect, test } from "bun:test";
import {
  REGLAS_POR_DEFECTO,
  decidir,
  reglas_desde,
  texto_anuncio,
  type Llamante,
  type ReglasTelefono,
} from "./decision.ts";
import { aplicar_conduciendo } from "./conduciendo.ts";

const conocido: Llamante = { conocido: true, clave: "k1", nombre: "Rafael", numero: "+525512345678" };
const otro: Llamante = { conocido: true, clave: "k2", nombre: "Luisa", numero: "+525511111111" };
const desconocido: Llamante = { conocido: false, numero: "+525599999999" };
const nadie = new Set<string>();

function reglas(extra: Partial<ReglasTelefono> = {}): ReglasTelefono {
  return { ...REGLAS_POR_DEFECTO, ...extra };
}

const suena = { accion: "permitir", anunciar: false, silenciar_timbre: false };

describe("decidir: timbre silenciado con el contestador activo", () => {
  test("activo silencia el timbre para contactos", () => {
    const d = decidir(reglas({ activo: true, ambito: "contactos" }), conocido, nadie, nadie);
    expect(d).toMatchObject({ accion: "contestar", anunciar: true, silenciar_timbre: true });
  });

  test("apagado deja sonar el timbre", () => {
    expect(decidir(reglas(), conocido, nadie, nadie)).toMatchObject(suena);
  });

  test("activo silencia también a desconocidos que se dejan entrar", () => {
    const d = decidir(reglas({ activo: true, ambito: "contactos" }), desconocido, nadie, nadie);
    expect(d).toMatchObject({ accion: "permitir", silenciar_timbre: true });
  });

  test("timbre silenciado aunque no se descuelgue a nadie", () => {
    const d = decidir(reglas({ activo: true, ambito: "nadie" }), conocido, nadie, nadie);
    expect(d).toMatchObject({ accion: "permitir", silenciar_timbre: true });
  });

  test("con ámbito todos se descuelga incluso a desconocidos", () => {
    const d = decidir(reglas({ activo: true, ambito: "todos" }), desconocido, nadie, nadie);
    expect(d.accion).toBe("contestar");
  });
});

describe("decidir: la locución manda sobre la voz, no sobre el timbre", () => {
  test("sin locución no se anuncia pero el timbre sigue callado", () => {
    const d = decidir(reglas({ activo: true, ambito: "contactos", anuncio_activo: false }), conocido, nadie, nadie);
    expect(d).toMatchObject({ accion: "contestar", anunciar: false, silenciar_timbre: true });
  });

  test("a un desconocido solo se le anuncia si así se pidió", () => {
    const base = { activo: true, ambito: "contactos" as const };
    expect(decidir(reglas({ ...base, anunciar_desconocidos: false }), desconocido, nadie, nadie).anunciar).toBe(false);
    expect(decidir(reglas(base), desconocido, nadie, nadie).anunciar).toBe(true);
  });
});

describe("decidir: rechazo con el contestador apagado", () => {
  test("apagado rechaza desconocido si así está configurado", () => {
    expect(decidir(reglas({ accion_desconocidos: "rechazar" }), desconocido, nadie, nadie).accion).toBe("rechazar");
  });

  test("apagado rechaza al contacto de la lista de rechazo", () => {
    expect(decidir(reglas(), conocido, nadie, new Set(["k1"])).accion).toBe("rechazar");
  });

  test("apagado deja sonar a quien no está en la lista de rechazo", () => {
    const rechazados = new Set(["k1"]);
    expect(decidir(reglas(), otro, nadie, rechazados)).toMatchObject(suena);
    expect(decidir(reglas(), desconocido, nadie, rechazados)).toMatchObject(suena);
  });

  test("la lista de rechazo no usa los contactos a contestar", () => {
    expect(decidir(reglas(), conocido, new Set(["k1"]), nadie)).toMatchObject(suena);
  });

  test("apagado, silenciar desconocidos no aplica: suena", () => {
    expect(decidir(reglas({ accion_desconocidos: "silenciar" }), desconocido, nadie, nadie)).toMatchObject(suena);
  });
});

describe("decidir: contestador encendido", () => {
  test("sigue descolgando solo a los elegidos", () => {
    const r = reglas({ activo: true, ambito: "seleccionados" });
    const elegido = decidir(r, conocido, new Set(["k1"]), nadie);
    const ajeno = decidir(r, otro, new Set(["k1"]), nadie);
    expect(elegido).toMatchObject({ accion: "contestar", silenciar_timbre: true });
    expect(ajeno).toMatchObject({ accion: "permitir", silenciar_timbre: true });
  });

  test("rechaza desconocido y contesta al conocido", () => {
    const r = reglas({ activo: true, ambito: "contactos", accion_desconocidos: "rechazar" });
    expect(decidir(r, desconocido, nadie, nadie).accion).toBe("rechazar");
    expect(decidir(r, conocido, nadie, nadie).accion).toBe("contestar");
  });

  test("silencia al desconocido anunciándolo", () => {
    const r = reglas({ activo: true, ambito: "contactos", accion_desconocidos: "silenciar" });
    expect(decidir(r, desconocido, nadie, nadie)).toMatchObject({ accion: "silenciar", anunciar: true, silenciar_timbre: true });
  });
});

describe("whatsapp", () => {
  test("viene activo por defecto con su propia plantilla", () => {
    expect(REGLAS_POR_DEFECTO.whatsapp_activo).toBe(true);
    expect(texto_anuncio(reglas(), conocido, "whatsapp")).toBe("Llamada de WhatsApp de Rafael");
    expect(texto_anuncio(reglas(), conocido)).toBe("Llamada de Rafael");
  });

  test("una llamada de whatsapp con whatsapp apagado suena como siempre", () => {
    const r = reglas({ activo: true, ambito: "todos", whatsapp_activo: false });
    expect(decidir(r, conocido, nadie, nadie, "whatsapp")).toMatchObject(suena);
    expect(decidir(r, conocido, nadie, nadie, "telefono").accion).toBe("contestar");
  });

  test("locuta el número o «número oculto» cuando no hay nombre", () => {
    expect(texto_anuncio(reglas(), desconocido)).toBe("Llamada de +525599999999");
    expect(texto_anuncio(reglas(), { conocido: false })).toBe("Llamada de número oculto");
  });
});

describe("conduciendo", () => {
  test("en marcha y con el modo activado fuerza el contestador y rechaza desconocidos", () => {
    const r = aplicar_conduciendo(reglas({ conduciendo_activo: true, ambito: "contactos" }), true);
    expect(r.activo).toBe(true);
    expect(r.accion_desconocidos).toBe("rechazar");
    expect(decidir(r, desconocido, nadie, nadie).accion).toBe("rechazar");
    expect(decidir(r, conocido, nadie, nadie).accion).toBe("contestar");
  });

  test("sin el modo activado, ir en marcha no cambia nada", () => {
    const base = reglas({ conduciendo_activo: false });
    expect(aplicar_conduciendo(base, true)).toEqual(base);
  });

  test("parado se aplican las reglas guardadas tal cual", () => {
    const base = reglas({ conduciendo_activo: true });
    expect(aplicar_conduciendo(base, false)).toEqual(base);
  });
});

describe("reglas_desde", () => {
  test("una fila incompleta o con valores raros cae a los valores por defecto", () => {
    const r = reglas_desde({ activo: "true", ambito: "marte", retardo_s: "7", anuncio_plantilla: "" });
    expect(r.activo).toBe(true);
    expect(r.ambito).toBe("nadie");
    expect(r.retardo_s).toBe(7);
    expect(r.anuncio_plantilla).toBe("Llamada de {nombre}");
    expect(r.whatsapp_activo).toBe(true);
    expect(r.anuncio_activo).toBe(true);
  });
});
