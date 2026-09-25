/** Símbolo de la marca: tejado mediterráneo sobre el mar, con el sol. Hereda --marca y --acento. */
export function Simbolo({ tam = 34 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--marca)" />
      <circle cx="28" cy="13" r="4.2" fill="var(--acento)" />
      <path d="M8 22.5 20 12l12 10.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 21v8h16v-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M7 32.5c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0 4.4-1.6 6.6 0 4.4 1.6 6.6 0" fill="none" stroke="color-mix(in oklab, #fff 70%, var(--marca))" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
