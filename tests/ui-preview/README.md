# Local experience acceptance

This harness renders the actual Arc pages against synthetic controllers. It blocks
external calls and writes no production business records. The fixed preview owner
is a fixture, not an authenticated account. Creation/plan persistence is verified
separately by component and service integration tests.

Start from the repository root:

```powershell
node tests/ui-preview/start.mjs
```

Open `http://127.0.0.1:4180/today`. Use `?guest=1` on a workspace page to inspect
its account boundary. `?simulate=running` on Coach simulates an unresolved request
for navigation/cancellation checks; it does not call a model.

Browser acceptance scripts use the existing isolated Playwright installation at
`work/ui-tools/node_modules/playwright`. Pass an existing absolute output directory:

```powershell
node tests/ui-preview/experience-visual.mjs <output-directory>
node tests/ui-preview/experience-responsive.mjs <output-directory>
node tests/ui-preview/experience-flows.mjs <output-directory>
node tests/ui-preview/experience-accessibility.mjs <output-directory>
```

After the production build, verify SSR routes and the genuine HTTP 404:

```powershell
npm run build
node --test tests/rendered-html.test.mjs
node tests/ui-preview/experience-ssr.mjs <output-directory>
```

The 720px scenario checks reflow equivalent to a 1440px viewport at 200% zoom.
It is not actual browser zoom or an accessibility certification. Keyboard focus
and reduced-motion checks are browser interactions; phone sizes and keyboard
focus are simulated, not physical-device testing. Screenshots show synthetic
content and must not be treated as evidence of production data correctness.
