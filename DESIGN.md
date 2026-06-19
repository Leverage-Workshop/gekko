---
version: alpha
name: BMW M-design-analysis
description: A confident financial-advisory interface anchored on a near-black canvas with white Inter display headlines in confident UPPERCASE. The brand energy comes from color voltage, not photography — bmw-blue (#1c69d4) is the primary accent that carries every primary CTA, value-claim headline, brand mark, and key callout, while m-red (#e22718) is the secondary accent reserved for calling out significant, high-priority UI. The iconic M tricolor stripe (light blue → dark blue → red) is retained as the brand signature on logos, dividers, and section chrome. Type stays light to medium weight to feel engineered and precise, never bombastic.

colors:
  primary: "#ffffff"
  ink: "#ffffff"
  body: "#bbbbbb"
  body-strong: "#e6e6e6"
  muted: "#7e7e7e"
  hairline: "#3c3c3c"
  hairline-strong: "#262626"
  canvas: "#000000"
  surface-card: "#1a1a1a"
  surface-elevated: "#262626"
  surface-soft: "#0d0d0d"
  on-primary: "#000000"
  on-dark: "#ffffff"
  m-blue-light: "#0066b1"
  m-blue-dark: "#1c69d4"
  m-red: "#e22718"
  bmw-blue: "#1c69d4"
  electric-blue: "#0653b6"
  carbon-gray: "#2b2b2b"
  warning: "#f4b400"
  success: "#0fa336"

typography:
  display-xl:
    fontFamily: "Inter, sans-serif"
    fontSize: 80px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0
  display-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: 0
  display-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0
  display-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: 0
  title-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0
  title-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  title-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  label-uppercase:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 1.5px
  body-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 300
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 300
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.5px
  button:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 1.5px
  nav-link:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.5px

rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 6px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  section: 96px

components:
  button-primary:
    backgroundColor: "{colors.bmw-blue}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 16px 32px
    height: 48px
  button-primary-outline:
    backgroundColor: transparent
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 16px 32px
    height: 48px
  button-on-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 16px 32px
  button-icon:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.full}"
    size: 48px
  text-link:
    backgroundColor: transparent
    textColor: "{colors.on-dark}"
    typography: "{typography.label-uppercase}"
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-dark}"
    typography: "{typography.nav-link}"
    height: 64px
  hero-photo-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-dark}"
    typography: "{typography.display-xl}"
    padding: 96px
  m-stripe-divider:
    backgroundColor: transparent
    textColor: "{colors.on-dark}"
    height: 4px
  feature-photo-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-dark}"
    typography: "{typography.title-md}"
    rounded: "{rounded.none}"
    padding: 24px
  model-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-dark}"
    typography: "{typography.title-lg}"
    rounded: "{rounded.none}"
    padding: 24px
  magazine-article-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-dark}"
    typography: "{typography.title-md}"
    rounded: "{rounded.none}"
    padding: 24px
  spec-cell:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 24px
  cookie-consent-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: 24px
  category-tab:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.label-uppercase}"
    padding: 12px 0
  category-tab-active:
    backgroundColor: transparent
    textColor: "{colors.on-dark}"
    typography: "{typography.label-uppercase}"
    padding: 12px 0
  text-input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 12px 16px
    height: 48px
  chatbot-launcher:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-dark}"
    typography: "{typography.title-md}"
    rounded: "{rounded.none}"
    padding: 24px
  cta-band-photo:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-dark}"
    typography: "{typography.display-md}"
    padding: 80px
  motorsport-photo-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-dark}"
    typography: "{typography.title-md}"
    rounded: "{rounded.none}"
  carousel-arrow:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.full}"
    size: 48px
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: 64px
---

## Overview

Gekko's surface is a near-pure black canvas (`{colors.canvas}` — #000) holding white Inter headlines in **confident UPPERCASE**. The brand energy comes from **color voltage, not photography**: a single primary accent — **bmw-blue** (`{colors.bmw-blue}` — #1c69d4) — does the brand's heavy lifting, carrying every primary CTA, value-claim headline, brand mark, key stat/number callout, and inline link. Used scarcely on the dark canvas, that blue voltage is what reads as "the brand." UI chrome around it stays minimal: thin sans-serif copy, dividers as 1px hairlines (`{colors.hairline}`), and the blue-filled CTA as the one confident point of color.

A **secondary accent — `{colors.m-red}` (#e22718)** — is reserved for calling out **significant, high-priority UI** (the way many product surfaces use a second accent for moments that demand attention). Its scarcity is what keeps it powerful; it never competes with bmw-blue as the primary action color.

The **M tricolor stripe** — `{colors.m-blue-light}` (#0066b1) → `{colors.m-blue-dark}` (#1c69d4) → `{colors.m-red}` (#e22718) — is retained as the brand's **signature** mark, used on the wordmark, section chrome, and brand-identity dividers. The stripe is a signature, not an action surface — never a button fill.

Type voice runs **Inter** (variable) in two weights: 700 for display + nav labels and 300 (Light) for body + secondary copy. Display sizes use weight 700 (the heavy-but-tight setting), while body type drops to weight 300 (Light). The contrast between heavy display and light body is the system's editorial signature.

**Key Characteristics:**
- Near-pure black canvas (`{colors.canvas}` — #000) with white type. The system inverts almost nothing — there is no light-mode surface.
- **bmw-blue** (`{colors.bmw-blue}`) is the single primary accent that does all brand voltage — primary CTA fills, value-claim headlines, brand mark, key callouts, and inline links. Scarce on the dark canvas, which is what makes it read as the brand.
- **m-red** (`{colors.m-red}`) is the secondary accent — reserved for significant / high-priority UI callouts only, never for primary actions.
- Display headlines in UPPERCASE Inter at weight 700. Sub-heads stay sentence-case at lighter weight.
- M tricolor (`{colors.m-blue-light}` / `{colors.m-blue-dark}` / `{colors.m-red}`) used as the 4px signature brand-stripe divider and wordmark accent — a brand-identity mark, never an action surface.
- Imagery, where present, is generic and supporting — it backs off to small white labels and never becomes the source of brand energy. The color does that work.
- Buttons are flat with `{rounded.none}` (0px) corners and uppercase letterspaced labels. The primary CTA is a solid bmw-blue rectangle; the rectangular silhouette IS the brand.
- Border radius is mostly zero across the system. The few exceptions: `{rounded.full}` on circular icon buttons (carousel arrows, chatbot launcher) and `{rounded.sm}` on a handful of small toggle pills.
- Spacing is generous and grid-aligned: `{spacing.section}` (96px) between major bands; `{spacing.xxl}` (64px) inside hero photo bands; `{spacing.xl}` (40px) inside content cards.

## Colors

### Brand & Accent
- **BMW Blue** (`{colors.bmw-blue}` — #1c69d4): **The primary brand accent — the single color that carries brand voltage.** Used for primary CTA fills (`{component.button-primary}`), value-claim headlines, the brand mark, key stat/number callouts, and inline links. Like a trading platform's signature accent, bmw-blue is deployed scarcely on the dark canvas so each appearance reads as a focal brand moment. It is also the middle stop of the M tricolor stripe.
- **M Red** (`{colors.m-red}` — #e22718): **The secondary accent — reserved for significant, high-priority UI callouts.** Used to mark UI that demands attention (critical alerts, the single most important value on a screen, urgency moments). It is a brand accent, not a generic semantic state — distinct from `{colors.warning}` and `{colors.success}`; it reads as attention/significance, which is the intent. Never used on primary CTAs (that is bmw-blue's role) and never as a large surface fill. It is also the third stop of the M tricolor stripe.
- **Primary / White** (`{colors.primary}` — #ffffff): The system's primary type color — h1/h2/h3 display and body text on dark, plus the label color on the bmw-blue primary button.
- **M Blue Light** (`{colors.m-blue-light}` — #0066b1): The first stop in the M tricolor signature stripe.
- **M Blue Dark** (`{colors.m-blue-dark}` — #1c69d4): The middle stop of the stripe — the same hex as `{colors.bmw-blue}`. The heritage corporate blue, which doubles as both the primary brand accent and the middle band of the signature stripe.
- **Electric Blue** (`{colors.electric-blue}` — #0653b6): A colder, more digital blue held in reserve for data-visualization or secondary-emphasis surfaces. Distinct from the heritage bmw-blue accent.

### Surface
- **Canvas** (`{colors.canvas}` — #000000): The default page floor across every marketing surface. True black.
- **Surface Soft** (`{colors.surface-soft}` — #0d0d0d): A barely-different-from-black used for spec table cells and footer-adjacent strips.
- **Surface Card** (`{colors.surface-card}` — #1a1a1a): Cards, secondary buttons, icon-button backgrounds.
- **Surface Elevated** (`{colors.surface-elevated}` — #262626): One step lighter, used for nested cards inside dark bands.
- **Carbon Gray** (`{colors.carbon-gray}` — #2b2b2b): Carbon-fiber-inspired surface tone used on technical-spec cards.

### Hairlines & Borders
- **Hairline** (`{colors.hairline}` — #3c3c3c): The 1px divider tone on dark surfaces. Used between body sections, between table rows, around card outlines.
- **Hairline Strong** (`{colors.hairline-strong}` — #262626): Same hex as `{colors.surface-elevated}` — borders feel like one-step elevations rather than ink lines.

### Text
- **Ink / On Dark** (`{colors.on-dark}` — #ffffff): All headline and primary text on dark canvas.
- **Body** (`{colors.body}` — #bbbbbb): Default running-text color (slightly cooler than pure white). Used for body paragraphs and secondary metadata.
- **Body Strong** (`{colors.body-strong}` — #e6e6e6): Emphasized body / lead paragraph.
- **Muted** (`{colors.muted}` — #7e7e7e): Footer links, breadcrumbs, captions.

### Semantic
- **Warning** (`{colors.warning}` — #f4b400): Used very sparingly on technical-warning callouts.
- **Success** (`{colors.success}` — #0fa336): Order-confirmation states (rare on marketing surfaces).

## Typography

### Font Family
**Inter** (variable) is the shipping typeface — it stands in for BMW's licensed **BMW Type Next Latin**, which inspired this system but isn't available. Inter is loaded via `next/font` and exposed as the `--font-display` token; the fallback stack walks `sans-serif`.

The split is a deliberate weight-pair:
- Display (700) for headlines, navigation labels, button text, and category labels — the "stamped" voice
- Light (300) for body paragraphs, descriptive copy, and secondary metadata — the "engineered" voice

The contrast between heavy display and light body is the editorial signature — never blur it by using regular (400) display or medium (500) body.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 80px | 700 | 1.0 | 0 | Hero h1 ("THE ULTIMATE", "MORE BMW M.") |
| `{typography.display-lg}` | 56px | 700 | 1.05 | 0 | Section heads ("MORE FROM BMW M MAGAZINE.") |
| `{typography.display-md}` | 40px | 700 | 1.1 | 0 | Sub-section heads, model names |
| `{typography.display-sm}` | 32px | 700 | 1.15 | 0 | CTA-band heads, category page titles |
| `{typography.title-lg}` | 24px | 700 | 1.3 | 0 | Card titles in 3-up grids |
| `{typography.title-md}` | 20px | 400 | 1.4 | 0 | Card sub-titles, lead paragraphs |
| `{typography.title-sm}` | 18px | 400 | 1.4 | 0 | Spec callouts, intro paragraphs |
| `{typography.label-uppercase}` | 14px | 700 | 1.3 | 1.5px | Category tabs, "VIEW MORE" inline labels |
| `{typography.body-md}` | 16px | 300 (Light) | 1.5 | 0 | Default body — Inter Light (300) |
| `{typography.body-sm}` | 14px | 300 (Light) | 1.5 | 0 | Footer body, cookie consent, fine print |
| `{typography.caption}` | 12px | 400 | 1.4 | 0.5px | Photo captions, image-credit lines |
| `{typography.button}` | 14px | 700 | 1.0 | 1.5px | All button labels — uppercase, letterspaced |
| `{typography.nav-link}` | 14px | 400 | 1.4 | 0.5px | Top-nav menu items |

### Principles
The system contrasts heavy headlines (700) against very light body (300) at all times — the gap is the editorial signature. Letter-spacing is non-trivial: button labels and category labels carry 1.5px tracking that makes them feel "machined" rather than "typed." Display headlines stay at 0 letter-spacing (tighten to -0.5px at the largest sizes to match BMW Type's spacing — see the substitution note below).

UPPERCASE display is the default voice for h1/h2 — sentence case appears on body and intro paragraphs but rarely on headlines. The all-caps treatment is a brand-voice signal, not a stylistic choice.

### Note on the Typeface
**Inter** (variable) at 700/300 is the shipping font, chosen as the closest open-source stand-in for BMW's licensed **BMW Type Next Latin** (the original brand reference). Display headline tracking is nudged to -0.5px at large sizes to match BMW Type's tighter spacing. If the licensed BMW face is ever available, swap it in at the same 700/300 weights. **Saira Condensed** is an alternative for headlines if a slightly more compressed feel is desired.

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 40px · `{spacing.xxl}` 64px · `{spacing.section}` 96px.
- **Section padding (vertical):** `{spacing.section}` (96px) between major editorial bands.
- **Hero photo bands:** `{spacing.xxl}` (64px) internal vertical padding around the hero h1 + sub-headline pair.
- **Card internal padding:** `{spacing.lg}` (24px) for content and model cards; `{spacing.xl}` (40px) for spec-cell tables.
- **Gutters:** `{spacing.lg}` (24px) between cards in 3-up grids; `{spacing.md}` (16px) inside footer columns.

### Grid & Container
- **Max content width:** ~1440px centered on marketing pages — wider than typical SaaS to give photography breathing room.
- **Editorial body:** Single 12-column grid; photo bands bleed full-bleed (no max-width).
- **Card grids:** 3-up at desktop, 2-up at tablet, 1-up at mobile.
- **Footer:** 4-column link list at desktop, 2-up at tablet, 1-up at mobile.

### Whitespace Philosophy
Gekko trusts color voltage and type to do the visual work. Whitespace is generous and uniform — content sits in tightly-aligned columns on the black canvas, with a bmw-blue accent providing the focal pop. Where whitespace appears (between body sections, around CTAs), it's always uniform `{spacing.section}` (96px). The system never adds atmospheric backdrops, gradients, or decoration — empty space stays as empty black canvas, which is what makes the blue accent read.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, no border | Body sections, top nav, footer, photo bands |
| Soft hairline | 1px `{colors.hairline}` border | Section dividers, card outlines, table rows |
| Card surface | `{colors.surface-card}` background over canvas — no shadow | Feature cards, content cards, chatbot launcher |
| Accent voltage | A bmw-blue CTA, headline, or callout against the black canvas | Hero bands, value-claim moments — focus via color contrast, not chrome |

The system uses no drop shadows and no layered chrome. Depth comes from the contrast between the black canvas and slightly-elevated `{colors.surface-card}`, and from the high-contrast pop of a bmw-blue accent (or, for significant moments, an m-red one) against the dark field.

### Decorative Depth
- **M Stripe Divider** (`{component.m-stripe-divider}`): A 4px-tall horizontal divider carrying the M tricolor (`{colors.m-blue-light}` → `{colors.m-blue-dark}` → `{colors.m-red}`). Used on section chrome, detail headers, and brand-identity moments. The stripe is the brand signature — used sparingly to mark significance.
- **Carbon-fiber surfaces**: The technical-spec sections use `{colors.carbon-gray}` (#2b2b2b) cells with subtle texture overlay. This is a localized treatment, not a system-wide pattern.
- **Accent voltage**: A bmw-blue CTA or headline (and, for the most significant UI, an m-red callout) against the black canvas does the elevation work that drop shadows would do in a SaaS system. The color pop is the depth.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | All buttons, cards, photo containers, spec cells, inputs — the dominant radius |
| `{rounded.xs}` | 2px | Almost no use — reserved for legal CTAs |
| `{rounded.sm}` | 4px | Small toggle pills on configurator surfaces |
| `{rounded.md}` | 6px | Rare — small dropdown menu items |
| `{rounded.full}` | 9999px / 50% | Circular icon buttons, carousel arrows, chatbot launcher |

The radius hierarchy is "almost always 0, sometimes circular." This binary radius decision is a deliberate brand-language choice — sharp rectangles read as engineered precision; circles read as functional controls. Nothing in between.

### Imagery Geometry
Where supporting imagery appears, it fills full-width with no rounding and stays generic (market/abstract, not a brand subject). Image cards inside grids retain `{rounded.none}` corners, edge-to-edge. Wide imagery uses 16:9 or 21:9 cinema-aspect ratios; portrait crops use 4:5, also with sharp corners. Imagery is a backdrop — the bmw-blue accent, not the image, carries the brand.

## Components

### Top Navigation

**`top-nav`** — Black nav bar pinned to the top of every page. 64px tall, `{colors.canvas}` background. Carries the BMW M logo at left (M tricolor + BMW roundel + "M" wordmark), primary horizontal menu (Models, Topics, Magazine, Configurator, Fastlane), right-side cluster with language selector, search icon, account icon. Menu items render in `{typography.nav-link}` with sentence-case labels.

### Buttons

**`button-primary`** — The signature primary CTA and the system's most important point of brand color. Background `{colors.bmw-blue}`, text `{colors.on-dark}` (white), rounded `{rounded.none}` (0px), padding 16px × 32px, height 48px. Type `{typography.button}` — uppercase 14px / 700 / 1.5px tracking. The solid blue rectangle with an uppercase letterspaced label IS the brand button — its scarcity on the black canvas is what gives the blue its voltage.

**`button-primary-outline`** — The secondary button: same shape as primary but with transparent background and white 1px outline only. Used for less-emphasized actions and where a filled button would crowd a busy band. Always pairs with — never replaces — the blue primary CTA as the dominant action.

**`button-on-light`** — Used on rare light-surface contexts (configurator, account dialogs). Background `{colors.canvas}`, text `{colors.on-dark}` — black button with white text, inverted from the dark-canvas default.

**`button-icon`** — Circular icon buttons (carousel controls, share, favorite). 48 × 48px, background `{colors.surface-card}`, white icon centered, rounded `{rounded.full}`. The only non-rectangular button shape in the system.

**`carousel-arrow`** — Specific 48 × 48 circular arrow used in photo carousels. Same shape as `{component.button-icon}` with chevron glyph.

**`text-link`** — Inline uppercase letterspaced links ("VIEW ALL MODELS", "READ MORE"). `{typography.label-uppercase}`, white on dark, no underline. The chevron arrow → glyph appears next to most link labels.

### Cards & Containers

**`hero-photo-band`** — Full-width black hero band. The h1 uses `{typography.display-xl}` (80px / 700) and sits left-aligned on the canvas, often with a small subtitle in `{typography.body-md}` below and a bmw-blue `{component.button-primary}` as the call to action. Vertical padding `{spacing.xxl}` (64px). Any imagery is a generic, supporting backdrop — the headline and the blue CTA carry the band, not a photo.

**`feature-photo-card`** — Used in 3-up grids for editorial / feature sections. Background `{colors.surface-card}`, rounded `{rounded.none}`, internal padding `{spacing.lg}` (24px). Top half of the card can hold a 16:9 generic image (full-bleed within the card); below it, a category tag in `{typography.label-uppercase}`, a `{typography.title-lg}` title, and a short body description.

**`model-card`** — Used in feature 3-up grids. Background `{colors.canvas}` (no card surface — content on black), rounded `{rounded.none}`. Top: an optional 16:10 supporting image. Below: a title in `{typography.display-md}` (40px / 700), a short detail line in `{typography.body-sm}`, and a `{component.text-link}` ("EXPLORE") rendered in bmw-blue.

**`magazine-article-card`** — A text-forward card variant for overview pages. Background `{colors.canvas}` with hairline border, rounded `{rounded.none}`. Carries a small thumbnail at top, a category label in `{typography.label-uppercase}`, headline in `{typography.title-lg}`, and a body excerpt.

**`spec-cell`** — Technical specification cells used on model-detail pages (engine specs, weight, top speed, 0-100 time). Background `{colors.surface-soft}` (#0d0d0d), rounded `{rounded.none}`, padding `{spacing.lg}` (24px). Each cell holds a value in `{typography.display-sm}` (32px / 700) at top and a label in `{typography.label-uppercase}` below.

**`motorsport-photo-card`** — Edge-to-edge image cards used in feature sections. No card surface — a full-bleed generic image with a small overlay caption in white text at the bottom-left. The image is a backdrop; the bmw-blue accent and type carry the brand, not the photo.

**`chatbot-launcher`** — A right-side card-style entry point ("BMW M CHATBOT") on the homepage. Background `{colors.surface-card}`, rounded `{rounded.none}`, padding `{spacing.lg}` (24px). Carries an h3 title, a short prompt, and a `{component.button-primary}` to launch.

**`category-tab`** + **`category-tab-active`** — The category selector tabs used on the magazine and topics pages (e.g., "ALL · MAGAZINE · MODELS · LIFESTYLE · MOTORSPORT"). Tabs render as text-only labels in `{typography.label-uppercase}`. Active state changes text color from `{colors.body}` to `{colors.on-dark}` and adds a 2px white underline below the label. No background fill, no rounded corners.

### Inputs & Forms

**`text-input`** — Standard text input on dark surfaces. Background `{colors.surface-card}`, text `{colors.on-dark}`, type `{typography.body-md}`, rounded `{rounded.none}` (0px), padding 12px × 16px, height 48px. 1px hairline border. Focus state thickens the border to white.

**`cookie-consent-card`** — A right-side cookie-banner card visible on the homepage. Background `{colors.canvas}` with 1px hairline, rounded `{rounded.none}`, padding `{spacing.lg}` (24px). Body text in `{typography.body-sm}` (14px / 300) — Light weight even for legal text. Two buttons stacked at bottom: primary outline + text-link.

### Signature Components

**`m-stripe-divider`** — The 4px horizontal stripe carrying the M tricolor (`{colors.m-blue-light}` → `{colors.m-blue-dark}` → `{colors.m-red}`). Used as a divider on section chrome, between brand-identity sections, and as a hover-state indicator on category tabs. The brand signature and the most distinctive non-typographic element in the system — a signature mark, never an action surface.

**`cta-band-photo`** — A pre-footer CTA band carrying a centered headline in `{typography.display-md}` and a bmw-blue `{component.button-primary}` below. Vertical padding 80px. The band's gravity comes from the headline and the blue CTA against the black canvas — color voltage, not photography. Any backdrop image stays generic and subordinate to the type.

### Footer

**`footer`** — Black footer that closes every page. Background `{colors.canvas}`, text `{colors.body}`. 4-column link list at desktop covering BMW M Models / BMW M Lifestyle / Owners / Company. Vertical padding 64px. Bottom row carries the BMW corporate disclaimer in `{typography.caption}` and language selector. The footer never inverts — it stays black even when the body might transition.

## Do's and Don'ts

### Do
- Let bmw-blue carry the brand voltage — primary CTAs, value-claim headlines, key callouts, and the brand mark. The blue accent on the black canvas is the brand energy.
- Keep bmw-blue scarce on the dark canvas. Its power comes from rarity — one confident blue moment per band, not blue everywhere.
- Reserve m-red for significant / high-priority UI callouts only — the secondary accent that marks the single most important or most urgent thing on a screen. Its scarcity keeps it meaningful.
- Use UPPERCASE display headlines in `{typography.display-xl}` or `{typography.display-lg}`. Sentence-case display reads as off-brand.
- Pair heavy display (700) with light body (300). The weight contrast is the editorial signature.
- Keep the M tricolor stripe as the brand signature — wordmark accents, section chrome, brand-identity dividers. Never as a button fill or surface.
- Use `{rounded.none}` (0px) by default. Reserve `{rounded.full}` for circular icon buttons only.
- Letter-space all-caps labels at 1.5px. The "machined" feel is non-negotiable.
- Use `{spacing.section}` (96px) between major bands for grid-aligned vertical rhythm.

### Don't
- Don't introduce a third brand accent. The system has exactly two: `{colors.bmw-blue}` (primary) and `{colors.m-red}` (secondary). Any expansion dilutes the identity.
- Don't put m-red on primary CTAs. bmw-blue is the primary action color; m-red is a secondary accent for significant UI, never the default button fill.
- Don't use bmw-blue or m-red as large surface fills. They are focal-point accents — CTAs, headlines, callouts — not background washes. The page floor stays black.
- Don't bold body type. Body stays at 300 (Light) — bumping to 400 or 500 makes the page feel bombastic instead of engineered.
- Don't use rounded buttons. The rectangular silhouette IS the brand. Rounded corners read as consumer-tech.
- Don't put gradient backdrops behind hero type. The page floor stays pure black, and the bmw-blue accent provides the depth — never an atmospheric glow.
- Don't repeat the same surface mode in two consecutive bands. Vary rhythm: hero band → spec table → feature grid → CTA band. Two flat text-only bands in a row read as a corporate site.
- Don't use the M stripe as a button fill. The stripe is the brand signature — never an action surface.
- Don't bold uppercase tracking under 1.5px on button labels — the spacing is what makes them feel "machined."

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Hamburger nav; hero h1 scales 80→48px; demo grid 1-up; photo cards stack full-width; footer 4 cols → 1 |
| Tablet | 768–1024px | Top nav stays horizontal but tightens; 2-up card grids; spec tables 2-up |
| Desktop | 1024–1440px | Full top-nav; 3-up card grids; spec tables 4-up |
| Wide | > 1440px | Same as desktop with more breathing room; max content 1440px |

### Touch Targets
- `{component.button-primary}` renders at 48 × 48px minimum — meets WCAG AAA.
- `{component.button-icon}` and `{component.carousel-arrow}` are exactly 48 × 48 — comfortably above the 44 × 44 minimum.
- `{component.text-input}` height is 48px.
- Category tabs render as text-only labels with 12px vertical padding; effective tap area meets 44px with surrounding spacing.

### Collapsing Strategy
- Top nav collapses to a hamburger sheet at < 768px; the menu opens as a full-screen black overlay with the M tricolor stripe at the top.
- Photography stays full-bleed at every breakpoint — never collapses to a margin'd container.
- Card grids reduce columns rather than scaling cards down; photography retains its native aspect ratio.
- Spec tables collapse from 4-up to 2-up to 1-up; spec values stay at `{typography.display-sm}` regardless of column count.
- The M-stripe divider stays at 4px height across all breakpoints.

### Image Behavior
- Hero photography crops responsively — wider crops at desktop, vertical crops on mobile.
- Supporting/lifestyle imagery retains native aspect ratios; the system never letterboxes or pillarboxes.
- The M wordmark + tricolor logo scales proportionally with viewport width.

## Iteration Guide

1. Focus on ONE component at a time. Reference its YAML key (`{component.hero-photo-band}`, `{component.spec-cell}`).
2. New components default to `{rounded.none}` (0px). Only use `{rounded.full}` if it's a circular icon button.
3. Variants (`-active`, `-disabled`) live as separate entries in `components:`.
4. Use `{token.refs}` everywhere — never inline hex.
5. Never document hover states. Default and Active/Pressed only.
6. Display headlines stay UPPERCASE 700; body stays sentence-case 300. Never blur the contrast.
7. bmw-blue is the primary action color (CTAs, headlines, callouts); m-red is the secondary accent for significant UI; the M tricolor stripe stays as the brand-identity signature. Don't blur these roles.
8. When in doubt about emphasis: a stronger bmw-blue accent or bigger type before any decoration. Color voltage is the energy, not imagery.

## Known Gaps

- The dembrandt frequency analyzer captured the white text (count 955) as the highest-frequency token. The black canvas was inferred from screenshot — dembrandt's body-background sampling didn't surface it as a top palette entry, but the page is unambiguously black-on-white-text.
- The exact M tricolor stops are documented from public BMW brand guidelines; the screenshots show the stripe as a small element but pixel-sampling at this resolution doesn't reliably distinguish #0066b1 from #1c69d4. Treat the documented stops as canonical based on BMW Design Works' published brand spec.
- Only two weights (Light 300 and regular 700) were observed in the BMW reference screenshots; Inter (the shipping font) is variable and covers the full axis, but the system intentionally uses just 300/700 to preserve the heavy/light editorial contrast.
- Animation and transition timings (photo carousel transitions, hover-reveal effects, configurator interactions) are not in scope.
- Form validation states beyond `{component.text-input}` defaults are not extracted — error / success input variants would need a configurator or order flow to confirm.
- The configurator surface (vehicle build pages with color / wheel / interior pickers) was not in the analyzed URL set; its swatch grid, comparison panels, and price-summary card are not documented here.
- The cookie consent overlay obscured part of the homepage hero in the captured screenshot; secondary hero treatments may carry variations not captured.
- **Brand adaptation note:** This system was originally extracted from a photography-led brand (BMW M) but has been re-pointed to a **color-voltage** brand model for Gekko — bmw-blue as the primary accent doing the brand work, m-red as a secondary accent for significant UI, and the M tricolor stripe retained as the signature. The color palette (hex values) is unchanged from the original extraction; only the brand-energy and color-usage roles were re-specified. Photo-bearing component entries are retained structurally but reframed as generic, supporting backdrops rather than the source of brand energy.
