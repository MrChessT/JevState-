// Límite de frecuencia por ventana deslizante de un minuto (sección 9: por IP y por sesión).
// En memoria del proceso: en serverless es por instancia, suficiente como primera barrera; el
// firewall de la plataforma cubre los abusos grandes.
export class LimiteFrecuencia {
  private readonly marcas = new Map<string, number[]>();

  constructor(
    private readonly porMinuto: number,
    private readonly maxClaves = 10_000,
  ) {}

  /** true si la petición entra; false si supera el límite. */
  permitir(clave: string, ahora = Date.now()): boolean {
    const desde = ahora - 60_000;
    const lista = (this.marcas.get(clave) ?? []).filter((t) => t > desde);
    if (lista.length >= this.porMinuto) {
      this.marcas.set(clave, lista);
      return false;
    }
    lista.push(ahora);
    this.marcas.delete(clave);
    this.marcas.set(clave, lista);
    if (this.marcas.size > this.maxClaves) this.marcas.delete(this.marcas.keys().next().value!);
    return true;
  }

  /** Segundos hasta que vuelva a entrar una petición. */
  espera(clave: string, ahora = Date.now()): number {
    const lista = this.marcas.get(clave) ?? [];
    return lista.length ? Math.max(1, Math.ceil((lista[0]! + 60_000 - ahora) / 1000)) : 0;
  }
}
