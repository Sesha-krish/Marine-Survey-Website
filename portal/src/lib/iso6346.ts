// ISO 6346 container number validation: 3-letter owner code, category (U/J/Z),
// 6-digit serial, 1 check digit. Input is normalised (spaces/dashes stripped, upper-cased)
// so "MSMU 497675 9" and "msmu4976759" are the same container.

const LETTER_VALUES: Record<string, number> = (() => {
  // Values skip multiples of 11: A=10, B=12 ... (11, 22, 33 are skipped)
  const map: Record<string, number> = {};
  let v = 10;
  for (let i = 0; i < 26; i++) {
    if (v % 11 === 0) v++;
    map[String.fromCharCode(65 + i)] = v;
    v++;
  }
  return map;
})();

export function normalizeContainer(raw: string): string {
  return raw.replace(/[\s\-_.]/g, "").toUpperCase();
}

export function checkDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = first10[i];
    const val = /[A-Z]/.test(ch) ? LETTER_VALUES[ch] : Number(ch);
    sum += val * 2 ** i;
  }
  return (sum % 11) % 10;
}

export type ContainerCheck = { ok: true; value: string } | { ok: false; value: string; error: string };

export function validateContainer(raw: string): ContainerCheck {
  const value = normalizeContainer(raw);
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(value)) {
    return { ok: false, value, error: "Must be 4 letters (ending U, J or Z) followed by 7 digits, e.g. MSKU1234565" };
  }
  const expected = checkDigit(value.slice(0, 10));
  if (expected !== Number(value[10])) {
    return { ok: false, value, error: `Check digit should be ${expected} — please re-check the number` };
  }
  return { ok: true, value };
}

/** Display form: "MSKU 123456 5". */
export function formatContainer(v?: string | null) {
  if (!v) return "—";
  const n = normalizeContainer(v);
  return n.length === 11 ? `${n.slice(0, 4)} ${n.slice(4, 10)} ${n.slice(10)}` : n;
}

/** Build a valid number from an owner+serial — used by the seed to make realistic demo data. */
export function makeContainer(owner4: string, serial6: string) {
  const base = `${owner4}${serial6}`;
  return `${base}${checkDigit(base)}`;
}
