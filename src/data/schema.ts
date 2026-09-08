// Schemas für event.yaml und site.yaml.
//
// Ersetzt den handgeschriebenen `parseYamlLite` aus der Vorgängerversion. Der
// alte Parser konnte keine Listen in Listen und meldete Datenfehler bestenfalls
// als Konsolen-Warnung im Browser — also erst, wenn die Seite schon live war.
// Hier scheitert stattdessen der Build.
//
// Die Aufteilung folgt der Frage „ändert sich das pro Jahr?": Alles, was mit
// dem Wettkampf 2026 kommt und geht, steht in event.yaml. Was das Jahr
// überdauert — Verein, Navigation, Kontaktwege — steht in site.yaml.

import { z } from 'astro/zod';

// Die Frist wird gegen einen absoluten Zeitpunkt verglichen. Ohne Offset würde
// `new Date()` die Angabe als Ortszeit des Betrachters lesen — jemand in einer
// anderen Zeitzone sähe die Anmeldung zu früh geschlossen. Das war bisher nur
// ein Kommentar in der README; jetzt bricht der Build.
const isoWithOffset = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/,
    'deadline muss ISO-8601 mit Zeitzonen-Offset sein, z. B. 2026-08-27T23:00:00+02:00',
  )
  .refine((v) => !Number.isNaN(Date.parse(v)), 'deadline ist kein gültiges Datum');

export const eventSchema = z.object({
  title: z.string().min(1),
  date: z.coerce.string(),
  date_label: z.string().min(1),
  location: z.string().min(1),
  location_detail: z.string().optional(),
  office_opens: z.string().optional(),
  deadline: isoWithOffset,
  deadline_label: z.string().min(1),
  late_fee: z.number().nonnegative().optional(),
  youth_birth_from: z.coerce.string().optional(),
  youth_birth_to: z.coerce.string().optional(),
  youth_label: z.string().optional(),
});

// Der Wettkampfort. Steht getrennt von `event.location`, weil die Startseite
// nur den Kurznamen zeigt, Ausschreibung und Strecke aber die volle Anschrift
// brauchen — und die soll nur an einer Stelle gepflegt werden.
export const venueSchema = z.object({
  name: z.string().min(1),
  detail: z.string().optional(),
  street: z.string().min(1),
  city: z.string().min(1),
  maps_url: z.string().url().optional(),
});

// Jedes Bild der Seite hat dieselbe Form — Streckenkarte, Album-Titelbild,
// Sponsorenlogo. Ein Schema dafür, damit `Figure.astro` genau einen Typ
// entgegennimmt und nicht drei fast gleiche.
//
// `alt` ist Pflicht, nicht optional: Auf der alten Seite hatte kein einziges
// Bild einen alt-Text, und tests/unit/dist.test.ts besteht darauf. Ein
// dekoratives Bild gehört ins CSS, nicht ins Markup.
export const imageSchema = z.object({
  src: z.string().min(1),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const courseSchema = z.object({
  headline: z.string().min(1),
  lap_length_m: z.number().int().positive(),
  paragraphs: z.array(z.string().min(1)).min(1),
  image: imageSchema.optional(),
});

export const providerSchema = z.object({
  name: z.string().min(1),
  event_id: z.number().int().positive(),
  regname: z.string().min(1),
  // Notausgang, wenn das Widget nicht lädt. Muss absolut sein — ein relativer
  // Link führte im Fehlerfall zurück auf unsere eigene, kaputte Seite.
  url: z.string().url(),
});

export const distanceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  // Die Zuordnung zum raceresult-Formular. Der Canary prüft täglich, dass es
  // diese ID dort noch gibt und sie dasselbe Label trägt.
  contest_id: z.number().int().nonnegative(),
  laps: z.number().int().positive(),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  price: z.number().nonnegative(),
  price_youth: z.number().nonnegative().optional(),
});

export const eventDataSchema = z.object({
  event: eventSchema,
  venue: venueSchema,
  course: courseSchema,
  provider: providerSchema,
  group: z
    .object({
      headline: z.string(),
      text: z.string(),
      note: z.string().optional(),
    })
    .optional(),
  legal: z.object({ processing: z.string().min(1) }).optional(),
  distances: z.array(distanceSchema).min(1),
  faq: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })).default([]),
});

// --------------------------------------------------------- ergebnisse.yaml

export const resultsSchema = z.object({
  timer: z.object({ name: z.string().min(1), url: z.string().url() }),
  years: z
    .array(
      z.object({
        year: z.number().int().min(2000).max(2100),
        // Absolut: Die Listen liegen beim Zeitnehmer, nicht bei uns.
        url: z.string().url(),
      }),
    )
    .min(1),
});

// -------------------------------------------------------------- fotos.yaml

// Aufgebaut wie resultsSchema — aber bewusst OHNE `.min(1)`: Eine leere Liste
// ist hier der gültige Ist-Zustand, solange keine Galerie umgezogen ist. Ein
// erzwungener Mindesteintrag hieße, einen zu erfinden.
export const photosSchema = z.object({
  albums: z
    .array(
      z.object({
        year: z.number().int().min(2000).max(2100),
        // Absolut: Die Bilder liegen dort, wo sie gepflegt werden.
        url: z.string().url(),
        title: z.string().min(1).optional(),
        cover: imageSchema.optional(),
      }),
    )
    .default([]),
});

// ---------------------------------------------------------------- site.yaml

// Interne Ziele beginnen mit „/" und enden mit „/". Beides erzwungen, weil der
// Build statisches HTML in Verzeichnisse legt: `/zeitplan` ohne Schrägstrich
// lädt auf GitHub Pages zwar noch, aber relative Links darin brechen dann.
const internalHref = z
  .string()
  .regex(/^\/(?:[a-z0-9-]+\/)*$/, 'interne Ziele: klein, mit führendem und schließendem /');

// Erscheint zusätzlich in der mobilen Daumenleiste. Höchstens drei Ziele —
// mehr passt neben „Start" und „Mehr" nicht auf ein 390px-Display, ohne dass
// die Beschriftungen umbrechen. Erzwungen in tests/unit/nav.test.ts.
//
// Steht am Blatt-Schema und gilt damit formal auch für footer.links, wo es
// wirkungslos ist. Ein eigenes Schema nur dafür wäre mehr Aufwand als Nutzen.
const navLeafSchema = z.object({
  label: z.string().min(1),
  href: internalHref,
  mobile: z.boolean().optional(),
  // Iconify-Name für die Daumenleiste, z. B. „lucide:clock". Gehört zum
  // Navigationseintrag und nicht in die Komponente: Sonst stünde die Zuordnung
  // Ziel → Symbol an einem zweiten Ort und driftete beim ersten Umbenennen.
  icon: z
    .string()
    .regex(/^[a-z0-9-]+:[a-z0-9-]+$/, 'Symbolname im Format „sammlung:name"')
    .optional(),
});

// Genau eine Ebene tief. Das ist keine Sparsamkeit, sondern die Form, die das
// Menü heute hat („Wettkampf" klappt auf) — und tiefer wird ein Menü mit sieben
// Einträgen auf dem Handy unbedienbar.
export const navItemSchema = z.union([
  navLeafSchema,
  z.object({
    label: z.string().min(1),
    children: z.array(navLeafSchema).min(1),
  }),
]);

export const siteSchema = z.object({
  site: z.object({
    name: z.string().min(1),
    tagline: z.string().min(1),
    url: z.string().url(),
    // Liegt unter public/. Steht hier, damit ein Verschieben der Datei eine
    // Zeile ist und nicht eine Suche über Layout, Kopfbereich und Favicon.
    logo: z.string().startsWith('/'),
  }),
  nav: z.array(navItemSchema).min(1),
  contact: z.object({
    email: z.string().email(),
    instagram: z.object({
      handle: z.string().regex(/^@[\w.]+$/),
      url: z.string().url(),
    }),
  }),
  organizer: z.object({
    name: z.string().min(1),
    legal_name: z.string().min(1),
    address_lines: z.array(z.string().min(1)).min(1),
    represented_by: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email(),
    register_court: z.string().min(1),
    register_number: z.string().min(1),
    content_responsible: z.string().min(1),
    url: z.string().url(),
  }),
  // Ein Logo trägt immer seine echten Maße mit. Ohne width/height reserviert
  // der Browser keinen Platz, und die Seite springt beim Nachladen.
  sponsors: z
    .object({
      headline: z.string().min(1),
      items: z
        .array(
          z.object({
            name: z.string().min(1),
            logo: z.string().startsWith('/'),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            url: z.string().url().optional(),
            role: z.string().optional(),
            // Ein bis zwei Sätze für /sponsoren/. Im Band unter jeder Seite
            // steht nur das Logo — wer wissen will, was ein Name mit dem
            // Wettkampf zu tun hat, findet die Antwort auf der eigenen Seite.
            description: z.string().optional(),
            // Erscheint zusätzlich im Seitenkopf. Kein zweiter Datenort für
            // denselben Sponsor — nur eine Markierung an dem, der schon da ist.
            header: z.boolean().optional(),
          }),
        )
        .min(1),
    })
    .optional(),
  footer: z.object({
    note: z.string().optional(),
    links: z.array(navLeafSchema).default([]),
  }),
});

export type EventData = z.infer<typeof eventDataSchema>;
export type SiteData = z.infer<typeof siteSchema>;
export type Results = z.infer<typeof resultsSchema>;
export type Photos = z.infer<typeof photosSchema>;
export type PhotoAlbum = Photos['albums'][number];
export type Distance = z.infer<typeof distanceSchema>;
export type EventInfo = z.infer<typeof eventSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Bild = z.infer<typeof imageSchema>;
export type NavItem = z.infer<typeof navItemSchema>;
