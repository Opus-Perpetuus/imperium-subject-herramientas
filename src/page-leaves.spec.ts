import { describe, expect, test } from "bun:test";
import { PAGE_LEAVES } from "./page-leaves.ts";
import { SUBJECT } from "./subject.ts";

describe("hojas en el /manifest en vivo", () => {
  test("cada hoja declarada sale en SUBJECT.manifest() y apunta a una página que existe", () => {
    const pages = SUBJECT.manifest().pages;
    const ids = new Set(pages.map((page) => page.id));
    for (const id of Object.keys(PAGE_LEAVES)) expect(ids.has(id)).toBe(true);
    const with_leaf = pages.filter((page) => page.leaf).map((page) => page.id).sort();
    expect(with_leaf).toEqual(Object.keys(PAGE_LEAVES).sort());
    expect(with_leaf.length).toBeGreaterThan(0);
  });

  test("herr-registro: la hoja pide .write como la página y el menú", () => {
    const page = SUBJECT.manifest().pages.find((p) => p.id === "herramientas.herr-registro");
    expect(page?.permission).toBe("subject.herramientas.herr-registros.write");
    expect(page?.leaf?.permission).toBe("subject.herramientas.herr-registros.write");
  });
});
