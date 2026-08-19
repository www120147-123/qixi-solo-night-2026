# 《鹊桥借我一晚》Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained, responsive interactive Qixi website that opens as a romantic Cowherd-and-Weaver-Girl magpie-bridge animation, flips into a solo-mode night with AI/game/anime/city chapters, and closes by rebuilding the bridge.

**Architecture:** A static Vite-compatible site using `index.html`, `styles.css`, `app.js`, and local media under `public/assets`. The experience is a deterministic finite state machine driven by chapter buttons, wheel/touch gestures, keyboard shortcuts, and local progress state; all major motion is CSS/Web Animations API so the Netlify build has no runtime API dependency.

**Tech Stack:** HTML5, CSS, vanilla JavaScript modules, Web Animations API, Canvas 2D for the star field, Web Audio API for local sound cues, Netlify static deployment.

---

## File Map

- `C:/Users/lenovo/Desktop/七夕告白网站_总规划/index.html`: semantic shell, all chapter stage markup, accessible controls.
- `C:/Users/lenovo/Desktop/七夕告白网站_总规划/styles.css`: design tokens, responsive layout, chapter-specific materials, motion states, reduced-motion rules.
- `C:/Users/lenovo/Desktop/七夕告白网站_总规划/app.js`: state machine, navigation, stars, local audio, chapter interactions, share-card generation.
- `C:/Users/lenovo/Desktop/七夕告白网站_总规划/public/assets/`: downloaded reference assets and generated original imagery.
- `C:/Users/lenovo/Desktop/七夕告白网站_总规划/public/assets/credits.json`: source and licensing notes for every non-generated asset.
- `C:/Users/lenovo/Desktop/七夕告白网站_总规划/package.json`: Vite build/preview scripts only.
- `C:/Users/lenovo/Desktop/七夕告白网站_总规划/netlify.toml`: static publish and SPA fallback.
- `C:/Users/lenovo/Desktop/七夕告白网站_总规划/tests/app.test.mjs`: Node test for state transitions and star progress.

### Task 1: Create the static project and failing state tests

**Files:**
- Create: `package.json`
- Create: `netlify.toml`
- Create: `tests/app.test.mjs`

- [ ] Write tests for `nextChapter`, `collectStar`, and `deriveConstellation` before implementation.
- [ ] Run `node --test tests/app.test.mjs` and confirm it fails because `app.js` does not export the functions yet.
- [ ] Add the minimal package scripts: `build: vite build`, `dev: vite --host 0.0.0.0`, `preview: vite preview`.
- [ ] Add Netlify publish config targeting `dist` and fallback to `/index.html`.

### Task 2: Lock the visual system and acquire media

**Files:**
- Create: `public/assets/credits.json`
- Create/copy: `public/assets/*`
- Create: `styles.css`

- [ ] Define exact tokens for myth mode, solo mode, paper texture, typography, spacing, z-depth, and timing.
- [ ] Copy only the allowed reference-site media that is needed for the experience; record each source URL and local filename in `credits.json`.
- [ ] Generate missing magpie-bridge key art with the built-in image generation tool, then copy the final artifact into `public/assets`.
- [ ] Build the static hero frame first so every animated element has a correct final layout before motion is added.

### Task 3: Implement the semantic chapter shell

**Files:**
- Create: `index.html`

- [ ] Add the loader, persistent HUD, sound button, chapter rail, skip/back controls, live status region, 10 chapter stages, and credits dialog.
- [ ] Keep all copy in semantic HTML; no text baked into generated imagery.
- [ ] Ensure controls have accessible names, focus styles, and keyboard equivalents.

### Task 4: Implement the deterministic experience controller

**Files:**
- Modify: `app.js`
- Modify: `tests/app.test.mjs`

- [ ] Export pure transition helpers and make the tests pass.
- [ ] Implement wheel, touch, keyboard, button, and chapter-rail navigation with debouncing.
- [ ] Persist completed stars and chosen identity words in localStorage; make reset explicit.
- [ ] Add reduced-motion handling that keeps every state reachable without animation timing.

### Task 5: Implement opening romance and reversal

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

- [ ] Animate the two paper-cut figures from opposite sides toward the bridge.
- [ ] Animate magpies onto the bridge using deterministic staggered paths.
- [ ] Freeze immediately before the embrace, then reveal `MEETING SUCCESSFUL` and `他们有鹊桥。你有整晚。`.
- [ ] Switch sound layers only after the user gesture that starts the experience.

### Task 6: Implement the four solo-mode worlds

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

- [ ] AI world: selectable conversation personas and generated identity-word result.
- [ ] GAME world: click/hold micro-challenge with a center media panel and acquired-star state.
- [ ] ANIME world: draggable comic frames and mirror-to-silhouette reveal.
- [ ] CITY world: three route markers with photo/video placeholders and local asset fallback.
- [ ] Ensure each world updates one star exactly once and cannot double-count repeated clicks.

### Task 7: Implement deep-space collection, bridge rebuild, and share card

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

- [ ] Render collected stars into a draggable constellation with deterministic names based on selection order.
- [ ] Animate the lines from constellation to bridge and bring back the opening figures as a merged silhouette.
- [ ] Generate a local PNG share card with date, constellation name, and final line; never upload personal input.

### Task 8: Verify and package

**Files:**
- Create: `README.md`
- Create: `tests/smoke.mjs`

- [ ] Run unit tests and `npm run build`.
- [ ] Start the local server and verify desktop plus 390x844 mobile in Browser/IAB.
- [ ] Check page identity, nonblank content, console logs, opening interaction, reversal, one world completion, bridge rebuild, and share-card action.
- [ ] Fix overflow, focus, missing asset, audio, or motion issues found in screenshots.
- [ ] Deploy the `dist` output to a shareable static host if the existing deployment credentials are available; otherwise provide the local preview URL and a zip.

---

## Self-review

- Covers the approved 10-chapter narrative: yes.
- Uses reference media only where explicitly allowed and tracks sources: yes.
- Keeps external API and external video availability out of the critical path: yes.
- Includes test-first state logic, responsive QA, accessibility, and package handoff: yes.
- No implementation has been claimed before the verification steps run: yes.
