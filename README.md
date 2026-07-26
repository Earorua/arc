# Arc.

Arc. turns a target role into an attributable technology map, a precise daily path, and proof of capability.

## Local development

Requires Node.js `>=22.13.0`.

On macOS, Linux, or another Unix-like shell:

```bash
npm install
npm run dev
```

The current scripts use POSIX-style environment variables. In Windows PowerShell, run them with Git Bash as npm's script shell:

```powershell
npm install
npm --script-shell="C:\Program Files\Git\bin\bash.exe" run dev
```

## Verification

On macOS, Linux, or another Unix-like shell:

```bash
npm run test:unit
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

In Windows PowerShell, the build uses the same Git Bash script shell:

```powershell
npm run test:unit
npm run lint
npm --script-shell="C:\Program Files\Git\bin\bash.exe" run build
node --test tests/rendered-html.test.mjs
```

## Current implementation

Experience Foundation is a deterministic, device-local flagship demo covering Setup, Path, Today, Stack, and Proof. Learning configuration, progress, and evidence remain on the current device; there is no login or cross-device sync in this phase.

D1-backed intelligence, live AI model providers, authentication, and uploads are intentionally reserved for later subsystem plans. The current experience does not call a live model or require an API key.
