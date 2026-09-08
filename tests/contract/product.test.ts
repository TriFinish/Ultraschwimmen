// Schicht A — „raceresult hat deployed".
//
// Schlägt hier etwas fehl, hat raceresult sein Produkt geändert. Angekündigt
// wird das nicht — genau dafür gibt es diesen Test.
// Der Workflow labelt diese Fehlschläge mit `canary:product`.

import { describe, expect, it } from 'vitest';
import { compareBaseline } from './baseline.js';
import { probeProduct, type ProductProbe } from './probe.js';

const probe: ProductProbe = await probeProduct();

// Die flüchtigen Kennungen gehören ins Log und nicht in die Baseline — wer ein
// Canary-Issue liest, will trotzdem sehen, auf welchem Stand raceresult war.
// Der Workflow hebt diese Zeile in den Kopf des Issues.
console.info(
  `raceresult-Stand: loader ${probe.loaderVersion}, build ${probe.build}, ` +
    `init ${probe.initLastModified ?? 'ohne Last-Modified'}`,
);

describe('raceresult Produkt-Schicht', () => {
  it('liefert eine Build-Version aus der unversionierten init.js', () => {
    // Das schärfste Einzelsignal der ganzen Kette. `init.js` selbst trägt keine
    // Version — sie transportiert nur den `build=`-Parameter weiter.
    expect(probe.build).toMatch(/^v\d+\.\d+\.\d+-\d+$/);
  });

  it('liefert eine Loader-Version', () => {
    expect(probe.loaderVersion).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('enthält alle CSS-Klassen, auf die unser Theming zielt', () => {
    // Fehlt hier eine Klasse, greift die entsprechende Regel in
    // src/styles/widget.css ins Leere — das Formular zeigt dann wieder Rot
    // oder bricht im Layout.
    expect(probe.productCssClasses).toEqual([
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
    ]);
  });

  it('enthält RRReg_Confirmation — daran hängt das Abschluss-Tracking', () => {
    // Eigener Test, weil der Verlust dieser Klasse nicht das Layout bricht,
    // sondern still die Conversion-Messung abschaltet.
    expect(probe.productCssClasses).toContain('RRReg_Confirmation');
  });

  it('entspricht der hinterlegten Baseline', () => {
    // Bewusst ohne alles, was sich bei einem inhaltsgleichen Redeploy mitdreht:
    //
    //   initEtag, initLastModified   neu bei jedem Ausliefern, auch unverändert
    //   loaderVersion, build         Zählerstände, die raceresult hochzählt
    //
    // Die beiden Versionen standen hier bis September 2026 drin und haben den
    // Canary sieben Tage am Stück rot gemeldet: loader v2.0.255 → v2.1.3 →
    // v2.1.161 in einer Woche, build v14.0.19-15 → -23 — während productCssSha
    // und die Klassenliste unverändert blieben. Es hat also nie etwas gegriffen,
    // was uns betrifft. Für die geschlossene Anmeldung steht die Begründung
    // schon in probe.ts, und sie gilt hier genauso: Ein Alarm, der immer steht,
    // wird nicht mehr gelesen.
    //
    // Überwacht bleiben beide trotzdem, nur an der schärferen Stelle: über die
    // Formatprüfungen oben — fehlt eine Version ganz, ist die Ladekette kaputt —
    // und über die beiden SHAs, die anschlagen, wenn sich am ausgelieferten
    // Inhalt wirklich etwas ändert. Die Werte selbst stehen im Log des Laufs.
    const {
      initEtag: _etag,
      initLastModified: _mod,
      loaderVersion: _loader,
      build: _build,
      ...stabil
    } = probe;
    compareBaseline('product', stabil);
  });
});
