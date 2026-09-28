/**
 * Odómetro estimado al cerrar un tramo: la lectura de apertura más los
 * kilómetros GPS recorridos desde entonces. Por voz no hay teclado para
 * dictar el odómetro; cerrar con la lectura de apertura dejaría el tramo en
 * cero kilómetros.
 */
export function odometro_al_cierre(km_inicial: number, km_gps_al_abrir: number, km_gps_ahora: number): number {
  return km_inicial + Math.max(0, km_gps_ahora - km_gps_al_abrir);
}
