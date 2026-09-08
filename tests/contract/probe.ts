// Sonden gegen die echte raceresult-Infrastruktur.
//
// Die Ladekette hat vier Stufen, und die dritte ist unversioniert:
//
//   my.raceresult.com/RRRegStart/load.js.php      v=… (Zählerstand)
//     └─ RRRegStart.js?v=…                        äußere Hülle
//          └─ events2.../registrations/init.js    ⚠ UNVERSIONIERT
//               ├─ registration.css?build=…       erzeugt unsere Klassen
//               └─ registration.js ?build=…       erzeugt unser Markup
//
// Überwacht werden muss die letzte Stufe: Dort entsteht das Markup, in das
// `src/scripts/widget.ts` greift. `init.js` ist das Scharnier dorthin und kann
// sich ohne Vorwarnung ändern — sie trug beim Anlegen dieses Tests einen
// Last-Modified-Zeitstempel von wenigen Stunden.
//
// Die beiden Versionsnummern sind dabei ausdrücklich KEIN Vertrag. raceresult
// zählt sie mehrmals pro Woche hoch, ohne dass sich am ausgelieferten Inhalt
// etwas ändert (beobachtet: loader v2.0.255 → v2.1.161 und build v14.0.19-15
// → -23 binnen einer Woche bei gleichbleibendem CSS). Sie werden deshalb
// gemessen und protokolliert, aber nicht gegen die Baseline gehalten — siehe
// product.test.ts.

import { createHash } from 'node:crypto';

export const LOADER_URL = 'https://my.raceresult.com/RRRegStart/load.js.php?lang=de';
export const INIT_URL = 'https://events2.raceresult.com/registrations/init.js?lang=de';
export const EVENT_ID = 383076;
export const REGNAME = 'Sammel-Anmeldung';

const REG_PAGE = `https://my.raceresult.com/${EVENT_ID}/registration?regname=${encodeURIComponent(REGNAME)}`;

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export class UnreachableError extends Error {}

/**
 * Die Anmeldung ist beim Zeitnehmer geschlossen.
 *
 * Ausdrücklich KEIN Vertragsbruch und kein Ausfall: Außerhalb der Meldephase
 * ist das der Normalzustand. Eigene Klasse, weil der Canary sonst monatelang
 * täglich „raceresult war nicht erreichbar" meldet — und ein Alarm, der immer
 * steht, wird nicht mehr gelesen.
 */
export class RegistrationClosedError extends Error {}

// Netzwerkfehler sind KEIN Vertragsbruch. Zweimal wiederholen und erst bei
// dauerhaftem Ausfall aufgeben — der Workflow meldet das mit einem anderen
// Label als eine echte Vertragsänderung.
async function fetchRetry(url: string, init?: RequestInit): Promise<Response> {
  let last: unknown;
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      last = new Error(`HTTP ${res.status} für ${url}`);
    } catch (err) {
      last = err;
    }
    if (versuch < 2) await new Promise((r) => setTimeout(r, 1500 * (versuch + 1)));
  }
  throw new UnreachableError(`${url} nach 3 Versuchen nicht erreichbar: ${String(last)}`);
}

export interface ProductProbe {
  loaderVersion: string;
  initEtag: string | null;
  initLastModified: string | null;
  build: string;
  productCssSha: string;
  productJsSha: string;
  productCssClasses: string[];
}

// Alles, was raceresult selbst ausliefert. Ändert sich hier etwas, hat
// raceresult deployed — und niemand sagt uns Bescheid.
export async function probeProduct(): Promise<ProductProbe> {
  const loader = await (await fetchRetry(LOADER_URL)).text();
  const loaderVersion = loader.match(/v=(v[\d.]+)/)?.[1] ?? '';

  const initRes = await fetchRetry(INIT_URL);
  const init = await initRes.text();
  const build = init.match(/build=(v[\d.\-]+)/)?.[1] ?? '';

  const base = 'https://events2.raceresult.com';
  const css = await (
    await fetchRetry(`${base}/registrations/registration.css?build=${build}`)
  ).text();
  const js = await (
    await fetchRetry(`${base}/registrations/registration.js?lang=de&build=${build}`)
  ).text();

  // Genau die Klassen, auf die `src/styles/widget.css` zielt.
  const wanted = [
    'RRReg_Confirmation',
    'RRReg_EntryField',
    'RRReg_EntryFees',
    'RRReg_TabsList',
    'RRReg_RadioGroupTile',
    'RRReg_Nav',
    'RRReg_Box',
    'RRReg_Table',
    'RRReg_Main',
    'RRReg_Page',
  ];

  return {
    loaderVersion,
    initEtag: initRes.headers.get('etag'),
    initLastModified: initRes.headers.get('last-modified'),
    build,
    productCssSha: sha256(css),
    productJsSha: sha256(js),
    productCssClasses: wanted.filter((c) => css.includes(c)),
  };
}

export interface ContestOption {
  Value: number;
  Label: string;
  SoldOut: boolean;
}

export interface EventProbe {
  contests: ContestOption[];
  contestFieldClassName: string;
  contestFieldControlType: string;
  organizerCssClasses: string[];
  organizerCssRedSelectors: string[];
  stepTitles: string[];
}

interface RRElement {
  ID?: string;
  ClassName?: string;
  Children?: RRElement[];
  Field?: { ControlType?: string; Values?: ContestOption[] };
}

function findElement(els: RRElement[], id: string): RRElement | undefined {
  for (const e of els) {
    if (e.ID === id) return e;
    if (e.Children) {
      const hit = findElement(e.Children, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

// Alles, was der Zeitnehmer in seinem Backend pflegt. Ändert sich hier etwas,
// genügt eine Rückfrage — deshalb im Workflow ein eigenes Label.
export async function probeEvent(): Promise<EventProbe> {
  const seite = await fetchRetry(REG_PAGE);
  const page = await seite.text();

  // Ist die Anmeldung geschlossen, leitet raceresult `/registration` per 301
  // auf die Event-Startseite um — die Query fällt dabei weg. Dann gibt es
  // weder Schlüssel noch Formular, über das sich etwas behaupten ließe.
  // Diese Prüfung steht VOR der Schlüsselsuche, weil sonst der fehlende
  // Schlüssel als Netzwerkausfall durchginge.
  if (!new URL(seite.url).pathname.includes('/registration') || /registration closed/i.test(page)) {
    throw new RegistrationClosedError(
      `Anmeldung für Event ${EVENT_ID} ist geschlossen (${REG_PAGE} → ${seite.url}).`,
    );
  }

  const key = page.match(/RRReg_key[ =]*"([^"]+)"/)?.[1];
  if (!key) throw new UnreachableError('RRReg_key nicht in der Registrierungsseite gefunden');

  const api =
    `https://events2.raceresult.com/api/registrations/request` +
    `?eventid=${EVENT_ID}&rname=${encodeURIComponent(REGNAME)}&key=${key}&lang=de`;
  const res = await fetchRetry(api, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ URL: REG_PAGE }),
  });
  const form = (await res.json()) as {
    Steps: Array<{ Title: string; Elements: RRElement[] }>;
    CSS: string;
  };

  const contestField = findElement(form.Steps[0]?.Elements ?? [], '1_0');
  const css = form.CSS ?? '';

  // Rot aus dem Veranstalter-Backend. Taucht es in einem Selektor auf, den wir
  // nicht überschreiben, schlägt unser Theming dort durch.
  const redSelectors = (css.match(/[^{}]+\{[^}]*(?:#c21b17|a81815)[^}]*\}/gi) ?? []).map((r) =>
    (r.split('{')[0] ?? '').trim(),
  );

  return {
    contests: contestField?.Field?.Values?.filter((v) => v.Value !== 0) ?? [],
    contestFieldClassName: contestField?.ClassName ?? '',
    contestFieldControlType: contestField?.Field?.ControlType ?? '',
    organizerCssClasses: ['RRReg_StarMandatory', 'BoxHTML'].filter((c) => css.includes(c)),
    organizerCssRedSelectors: redSelectors,
    stepTitles: form.Steps.map((s) => s.Title),
  };
}

/**
 * Beantwortet die eine Frage, die E2E-Tests am eingebetteten Formular stellen
 * müssen, bevor sie etwas behaupten: Gibt es dort gerade überhaupt ein Formular?
 *
 * Gibt nie einen Fehler weiter — auch ein Netzwerkausfall führt hier zu
 * `offen: false`. Ein E2E-Lauf soll nicht daran scheitern, dass raceresult
 * gerade nicht mag; dafür ist der Canary da, der genau diesen Unterschied
 * unterscheidet und meldet.
 */
export async function anmeldungOffen(): Promise<{ offen: boolean; grund: string }> {
  try {
    await probeEvent();
    return { offen: true, grund: '' };
  } catch (err) {
    if (err instanceof RegistrationClosedError) {
      return { offen: false, grund: 'Anmeldung bei raceresult geschlossen' };
    }
    return { offen: false, grund: `raceresult nicht erreichbar: ${String(err)}` };
  }
}
