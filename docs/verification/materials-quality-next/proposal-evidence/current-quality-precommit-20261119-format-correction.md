# Save-check format correction

The first invocation of `current-quality-precommit-20261119.mjs` exited 1 after staged-byte/source checks, at the archive iteration: `TypeError: manifest.files is not iterable`. The original checker bytes are preserved in `current-quality-precommit-20261119-before-format-fix.mjs.source.txt`; the error remains in the tool transcript.

Read-only inspection confirmed the accepted binding-v2 manifest has relative `entries`, while the operator/final manifests have full-path `files`. The save checker now reads those two exact established formats and still checks every raw SHA-256. No manifest, expected hash, source, application test or accepted evidence was changed. This is an archive-packaging check correction, not a product/test failure or an additional test campaign.
