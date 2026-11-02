import type { KirletManifestLeaf, KirletModuleDef } from "@opus-perpetuus/imperium-core-kit";

/**
 * Hoja de shell de cada página (`pages[].leaf` del /manifest en vivo).
 * Antes solo vivían en `manifest.json`; el kit sirve el manifest desde el
 * código, así que sin esto el /manifest salía sin hojas.
 *
 * `herr-registro` es solo para capturar: hoja, página y menú piden `.write`.
 * Con `.read` el núcleo le daba la ruta a quien solo lee (hoja visible de más);
 * el kit y el núcleo admiten `.write` en la hoja y solo la sirven a quien crea
 * o actualiza (herr-tablas.lectura.spec).
 */
export const PAGE_LEAVES: Record<string, KirletManifestLeaf> = {
  "herramientas.herr-inicio": {
    "kind": "page",
    "icon": "fa-toolbox"
  },
  "herramientas.herr-tablas": {
    "kind": "crud",
    "appBase": "herr-tablas",
    "icon": "fa-table-list",
    "listHeaders": {
      "es": {
        "name": "Nombre",
        "plantilla_id": "Plantilla",
        "cerrable": "Cerrable",
        "version_esquema": "Versión",
        "updated_at": "Actualizada"
      }
    },
    "formLabels": {
      "es": {
        "name": "Nombre",
        "plantilla_id": "Plantilla",
        "cerrable": "Cerrable",
        "version_esquema": "Versión",
        "updated_at": "Actualizada"
      }
    }
  },
  "herramientas.herr-tabla": {
    "kind": "page",
    "icon": "fa-table"
  },
  "herramientas.herr-registros": {
    "kind": "crud",
    "appBase": "herr-registros",
    "icon": "fa-list-ol",
    "listHeaders": {
      "es": {
        "foto": "Foto",
        "name": "Registro",
        "tabla_id": "Tabla",
        "updated_at": "Actualizado"
      }
    },
    "formLabels": {
      "es": {
        "foto": "Foto",
        "name": "Registro",
        "tabla_id": "Tabla",
        "updated_at": "Actualizado"
      }
    }
  },
  "herramientas.herr-registro": {
    "kind": "page",
    "icon": "fa-pen-to-square",
    "permission": "subject.herramientas.herr-registros.write"
  },
  "herramientas.herr-cierres": {
    "kind": "crud",
    "appBase": "herr-cierres",
    "icon": "fa-box-archive",
    "listHeaders": {
      "es": {
        "name": "Registro",
        "tabla_id": "Tabla",
        "cierre_id": "Cierre",
        "cerrado_at": "Cerrado"
      }
    },
    "formLabels": {
      "es": {
        "name": "Registro",
        "tabla_id": "Tabla",
        "cierre_id": "Cierre",
        "cerrado_at": "Cerrado"
      }
    }
  },
  "herramientas.herr-jornadas": {
    "kind": "crud",
    "appBase": "herr-jornadas",
    "icon": "fa-flag-checkered",
    "listHeaders": {
      "es": {
        "fecha": "Fecha",
        "vehiculo_nombre": "Vehículo",
        "estado": "Estado",
        "entregas": "Entregas",
        "km_recorridos": "Km",
        "ganancia_neta": "Ganancia"
      }
    },
    "formLabels": {
      "es": {
        "fecha": "Fecha",
        "vehiculo_nombre": "Vehículo",
        "estado": "Estado",
        "entregas": "Entregas",
        "km_recorridos": "Km",
        "ganancia_neta": "Ganancia"
      }
    }
  },
  "herramientas.herr-jornada": {
    "kind": "page",
    "icon": "fa-motorcycle"
  },
  "herramientas.herr-liquidacion": {
    "kind": "page",
    "icon": "fa-hand-holding-dollar"
  },
  "herramientas.herr-pedidos": {
    "kind": "crud",
    "appBase": "herr-pedidos",
    "icon": "fa-clipboard-check",
    "listHeaders": {
      "es": {
        "orden": "N.º",
        "domicilio_texto": "Domicilio",
        "cobrar": "Cobrar",
        "estado": "Estado",
        "hora": "Hora"
      }
    },
    "formLabels": {
      "es": {
        "orden": "N.º",
        "domicilio_texto": "Domicilio",
        "cobrar": "Cobrar",
        "estado": "Estado",
        "hora": "Hora"
      }
    }
  },
  "herramientas.herr-gastos": {
    "kind": "crud",
    "appBase": "herr-gastos",
    "icon": "fa-money-bill-wave",
    "listHeaders": {
      "es": {
        "fecha": "Fecha",
        "motivo": "Motivo",
        "cantidad": "Cantidad",
        "fuente": "Fuente",
        "descontado": "Descontado"
      }
    },
    "formLabels": {
      "es": {
        "fecha": "Fecha",
        "motivo": "Motivo",
        "cantidad": "Cantidad",
        "fuente": "Fuente",
        "descontado": "Descontado"
      }
    }
  },
  "herramientas.herr-caja": {
    "kind": "crud",
    "appBase": "herr-caja",
    "icon": "fa-cash-register",
    "listHeaders": {
      "es": {
        "fecha": "Fecha",
        "tipo": "Tipo",
        "cantidad": "Cantidad",
        "saldado": "Saldado"
      }
    },
    "formLabels": {
      "es": {
        "fecha": "Fecha",
        "tipo": "Tipo",
        "cantidad": "Cantidad",
        "saldado": "Saldado"
      }
    }
  },
  "herramientas.herr-menu-categorias": {
    "kind": "crud",
    "appBase": "herr-menu-categorias",
    "icon": "fa-layer-group",
    "listHeaders": {
      "es": {
        "name": "Nombre",
        "columna_precio": "Columna de precio"
      }
    },
    "formLabels": {
      "es": {
        "name": "Nombre",
        "columna_precio": "Columna de precio"
      }
    }
  },
  "herramientas.herr-menu-tamanos": {
    "kind": "crud",
    "appBase": "herr-menu-tamanos",
    "icon": "fa-ruler",
    "listHeaders": {
      "es": {
        "name": "Nombre",
        "precio_1": "Precio 1",
        "precio_2": "Precio 2",
        "precio_3": "Precio 3",
        "divisible": "Partes"
      }
    },
    "formLabels": {
      "es": {
        "name": "Nombre",
        "precio_1": "Precio 1",
        "precio_2": "Precio 2",
        "precio_3": "Precio 3",
        "divisible": "Partes"
      }
    }
  },
  "herramientas.herr-menu-productos": {
    "kind": "crud",
    "appBase": "herr-menu-productos",
    "icon": "fa-box-open",
    "listHeaders": {
      "es": {
        "name": "Nombre",
        "categoria_id": "Categoría",
        "activo": "Activo"
      }
    },
    "formLabels": {
      "es": {
        "name": "Nombre",
        "categoria_id": "Categoría",
        "activo": "Activo"
      }
    }
  },
  "herramientas.herr-menu-extras": {
    "kind": "crud",
    "appBase": "herr-menu-extras",
    "icon": "fa-circle-plus",
    "listHeaders": {
      "es": {
        "name": "Nombre",
        "precio": "Precio",
        "activo": "Activo"
      }
    },
    "formLabels": {
      "es": {
        "name": "Nombre",
        "precio": "Precio",
        "activo": "Activo"
      }
    }
  },
  "herramientas.herr-menu-complementos": {
    "kind": "crud",
    "appBase": "herr-menu-complementos",
    "icon": "fa-bowl-food",
    "listHeaders": {
      "es": {
        "name": "Grupo",
        "variante": "Variante",
        "precio": "Precio",
        "activo": "Activo"
      }
    },
    "formLabels": {
      "es": {
        "name": "Grupo",
        "variante": "Variante",
        "precio": "Precio",
        "activo": "Activo"
      }
    }
  },
  "herramientas.herr-menu-promos": {
    "kind": "crud",
    "appBase": "herr-menu-promos",
    "icon": "fa-percent",
    "listHeaders": {
      "es": {
        "name": "Nombre",
        "descuento_pesos": "Descuento $",
        "descuento_pct": "Descuento %",
        "activa": "Activa"
      }
    },
    "formLabels": {
      "es": {
        "name": "Nombre",
        "descuento_pesos": "Descuento $",
        "descuento_pct": "Descuento %",
        "activa": "Activa"
      }
    }
  },
  "herramientas.herr-vehiculos": {
    "kind": "crud",
    "appBase": "herr-vehiculos",
    "icon": "fa-car",
    "listHeaders": {
      "es": {
        "name": "Vehículo",
        "vehiculo_id": "Id en Vehículos",
        "tanque_litros": "Tanque (L)",
        "medidor": "Medidor",
        "solo_gps": "Solo GPS"
      }
    },
    "formLabels": {
      "es": {
        "name": "Vehículo",
        "vehiculo_id": "Id en Vehículos",
        "tanque_litros": "Tanque (L)",
        "medidor": "Medidor",
        "solo_gps": "Solo GPS"
      }
    }
  },
  "herramientas.herr-domicilios": {
    "kind": "crud",
    "appBase": "herr-domicilios",
    "icon": "fa-map-location-dot",
    "listHeaders": {
      "es": {
        "name": "Alias",
        "calle": "Calle",
        "numero": "Número",
        "colonia": "Colonia",
        "veces": "Entregas",
        "ultima_entrega": "Última"
      }
    },
    "formLabels": {
      "es": {
        "name": "Alias",
        "calle": "Calle",
        "numero": "Número",
        "colonia": "Colonia",
        "veces": "Entregas",
        "ultima_entrega": "Última"
      }
    }
  },
  "herramientas.herr-etiquetas": {
    "kind": "crud",
    "appBase": "herr-etiquetas",
    "icon": "fa-hashtag",
    "listHeaders": {
      "es": {
        "name": "Nombre",
        "color": "Color"
      }
    },
    "formLabels": {
      "es": {
        "name": "Nombre",
        "color": "Color"
      }
    }
  },
  "herramientas.herr-recargas": {
    "kind": "crud",
    "appBase": "herr-recargas",
    "icon": "fa-gas-pump",
    "listHeaders": {
      "es": {
        "name": "Recarga",
        "fecha_hora": "Fecha",
        "pesos": "Pesos",
        "litros_efectivos": "Litros",
        "km": "Km",
        "tanque_lleno": "Lleno"
      }
    },
    "formLabels": {
      "es": {
        "name": "Recarga",
        "fecha_hora": "Fecha",
        "pesos": "Pesos",
        "litros_efectivos": "Litros",
        "km": "Km",
        "tanque_lleno": "Lleno"
      }
    }
  },
  "herramientas.herr-rutas": {
    "kind": "crud",
    "appBase": "herr-rutas",
    "icon": "fa-route",
    "listHeaders": {
      "es": {
        "name": "Ruta",
        "iniciada": "Inicio",
        "terminada": "Fin",
        "distancia_m": "Distancia (m)",
        "jornada_id": "Jornada"
      }
    },
    "formLabels": {
      "es": {
        "name": "Ruta",
        "iniciada": "Inicio",
        "terminada": "Fin",
        "distancia_m": "Distancia (m)",
        "jornada_id": "Jornada"
      }
    }
  },
  "herramientas.herr-telefono": {
    "kind": "crud",
    "appBase": "herr-telefono",
    "icon": "fa-phone-volume",
    "listHeaders": {
      "es": {
        "name": "Perfil",
        "es_activa": "Vigente",
        "activo": "Contestador",
        "ambito": "Contesta a",
        "accion_desconocidos": "Desconocidos"
      }
    },
    "formLabels": {
      "es": {
        "name": "Perfil",
        "es_activa": "Vigente",
        "activo": "Contestador",
        "ambito": "Contesta a",
        "accion_desconocidos": "Desconocidos"
      }
    }
  },
  "herramientas.herr-telefono-contactos": {
    "kind": "crud",
    "appBase": "herr-telefono/contactos",
    "icon": "fa-address-book",
    "listHeaders": {
      "es": {
        "name": "Contacto",
        "modo": "Modo",
        "telefono": "Teléfono",
        "regla_id": "Perfil"
      }
    },
    "formLabels": {
      "es": {
        "name": "Contacto",
        "modo": "Modo",
        "telefono": "Teléfono",
        "regla_id": "Perfil"
      }
    }
  },
  "herramientas.herr-telefono-llamadas": {
    "kind": "crud",
    "appBase": "herr-telefono/llamadas",
    "icon": "fa-phone-slash",
    "listHeaders": {
      "es": {
        "fecha_hora": "Cuándo",
        "decision": "Decisión",
        "contacto_nombre": "Contacto",
        "numero": "Número",
        "origen": "Origen"
      }
    },
    "formLabels": {
      "es": {
        "fecha_hora": "Cuándo",
        "decision": "Decisión",
        "contacto_nombre": "Contacto",
        "numero": "Número",
        "origen": "Origen"
      }
    }
  },
  "herramientas.herr-voz": {
    "kind": "crud",
    "appBase": "herr-voz",
    "icon": "fa-sliders",
    "listHeaders": {
      "es": {
        "name": "Perfil",
        "es_activa": "En uso",
        "umbral": "Umbral",
        "confirmar_antes": "Confirmar antes",
        "idioma": "Idioma"
      }
    },
    "formLabels": {
      "es": {
        "name": "Perfil",
        "es_activa": "En uso",
        "umbral": "Umbral",
        "confirmar_antes": "Confirmar antes",
        "idioma": "Idioma"
      }
    }
  },
  "herramientas.herr-asistente": {
    "kind": "page",
    "icon": "fa-microphone-lines"
  },
  "herramientas.herr-voz-bitacora": {
    "kind": "crud",
    "appBase": "herr-voz/bitacora",
    "icon": "fa-scroll",
    "listHeaders": {
      "es": {
        "fecha_hora": "Fecha",
        "name": "Orden",
        "intencion": "Intención",
        "estado": "Estado",
        "confianza": "Confianza",
        "respuesta": "Respuesta"
      }
    },
    "formLabels": {
      "es": {
        "fecha_hora": "Fecha",
        "name": "Orden",
        "intencion": "Intención",
        "estado": "Estado",
        "confianza": "Confianza",
        "respuesta": "Respuesta"
      }
    }
  },
  "herramientas.herr-agenda": {
    "kind": "crud",
    "appBase": "herr-agenda",
    "icon": "fa-calendar-days",
    "listHeaders": {
      "es": {
        "fecha": "Fecha",
        "name": "Título",
        "inicio_minuto": "Inicio (min)",
        "hecho": "Hecho",
        "alarma": "Alarma"
      }
    },
    "formLabels": {
      "es": {
        "fecha": "Fecha",
        "name": "Título",
        "inicio_minuto": "Inicio (min)",
        "hecho": "Hecho",
        "alarma": "Alarma"
      }
    }
  },
  "herramientas.herr-agenda-dia": {
    "kind": "page",
    "icon": "fa-calendar-day"
  },
  "herramientas.herr-utilidades": {
    "kind": "page",
    "icon": "fa-screwdriver-wrench"
  }
};

/** Pone a cada página la hoja que le toca, sin pisar una declarada a mano. */
export function con_hojas(modules: KirletModuleDef[]): KirletModuleDef[] {
  return modules.map((mod) => ({
    ...mod,
    pages: mod.pages?.map((page) => (page.leaf || !PAGE_LEAVES[page.id] ? page : { ...page, leaf: PAGE_LEAVES[page.id] })),
  }));
}
