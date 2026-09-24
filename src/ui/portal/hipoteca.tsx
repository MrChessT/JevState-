"use client";

import { useMemo, useState } from "react";
import { calcularHipoteca } from "@/portal/hipoteca";
import s from "./portal.module.css";

interface Textos {
  hipoteca: string;
  aviso: string;
  entrada: string;
  interes: string;
  plazo: string;
  cuota: string;
  prestamo: string;
  ahorro: string;
}

/** Calculadora orientativa: el código calcula (decimal.js); el texto lo dice. */
export function CalculadoraHipoteca({ precio, localeIntl, textos }: { precio: number; localeIntl: string; textos: Textos }) {
  const [entrada, setEntrada] = useState("20");
  const [interes, setInteres] = useState("3");
  const [anos, setAnos] = useState("30");
  const r = useMemo(() => {
    const ok = [entrada, interes, anos].every((x) => x !== "" && Number.isFinite(Number(x)) && Number(x) >= 0) && Number(anos) >= 1 && Number(entrada) <= 100;
    return ok ? calcularHipoteca({ precio: String(precio), entradaPct: entrada, interesAnual: interes, anos: Number(anos) }) : null;
  }, [precio, entrada, interes, anos]);
  const eur = (x: string, dec = 0) => new Intl.NumberFormat(localeIntl, { style: "currency", currency: "EUR", maximumFractionDigits: dec }).format(Number(x));
  return (
    <section className={s.panel} aria-labelledby="hipoteca">
      <h2 id="hipoteca">{textos.hipoteca}</h2>
      <div className={s.hipotecaCampos}>
        <label>
          {textos.entrada}
          <input type="number" min={0} max={100} value={entrada} onChange={(e) => setEntrada(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          {textos.interes}
          <input type="number" min={0} max={20} step={0.1} value={interes} onChange={(e) => setInteres(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          {textos.plazo}
          <input type="number" min={1} max={40} value={anos} onChange={(e) => setAnos(e.target.value)} inputMode="numeric" />
        </label>
      </div>
      {r && (
        <dl className={s.hipotecaResultado} aria-live="polite">
          <div>
            <dt>{textos.cuota}</dt>
            <dd className={s.cuota}>{eur(r.cuotaMensual, 0)}</dd>
          </div>
          <div>
            <dt>{textos.prestamo}</dt>
            <dd>{eur(r.prestamo)}</dd>
          </div>
          <div>
            <dt>{textos.ahorro}</dt>
            <dd>{eur(r.ahorroNecesario)}</dd>
          </div>
        </dl>
      )}
      <p className={s.nota}>{textos.aviso}</p>
    </section>
  );
}
