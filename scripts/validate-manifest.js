#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

// Official semver.org regex (https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string)
// Accepts the prerelease and build-metadata grammar; rejects empty identifiers,
// leading zeros on numeric identifiers, and stray underscores.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
// Obsidian's minAppVersion is documented as plain X.Y.Z without prerelease/build metadata.
const MINAPP_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const ID_FORMAT = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const URL_FORMAT = /^https?:\/\/[^\s]+$/
// Obsidian's plugin submission spec forbids "obsidian" / "plugin" in manifest.id
// and forbids "Obsidian" / "Plugin" as whole words in manifest.name.
// See https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins
const ID_FORBIDDEN_SUBSTRINGS = /(obsidian|plugin)/i
const NAME_FORBIDDEN_WORDS = /\b(obsidian|plugin)\b/i
const SUBMISSION_DOC = 'https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins'
const errors = []

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    errors.push(`failed to read or parse ${path}: ${err.message}`)
    return null
  }
}

const manifest = readJson('manifest.json')
const versions = readJson('versions.json')
const pkg = readJson('package.json')

if (manifest && versions && pkg) {
  const required = [
    'id',
    'name',
    'version',
    'minAppVersion',
    'description',
    'author',
    'authorUrl',
    'isDesktopOnly',
  ]
  for (const field of required) {
    if (!(field in manifest)) {
      errors.push(`manifest.json missing required field: ${field}`)
    }
  }

  if (typeof manifest.id !== 'string' || !ID_FORMAT.test(manifest.id)) {
    errors.push(
      `manifest.id must be lowercase alphanumeric (hyphens allowed in the middle); got: ${JSON.stringify(manifest.id)}`,
    )
  }

  if (typeof manifest.id === 'string' && ID_FORBIDDEN_SUBSTRINGS.test(manifest.id)) {
    errors.push(
      `manifest.id must not contain "obsidian" or "plugin" (case-insensitive); got: ${JSON.stringify(manifest.id)}. See ${SUBMISSION_DOC}`,
    )
  }

  // In CI, manifest.id must match the GitHub repository name (the segment after
  // the owner in GITHUB_REPOSITORY). Skipped in local dev because worktrees and
  // checkouts can land under arbitrary folder names.
  if (
    typeof manifest.id === 'string' &&
    process.env.CI === 'true' &&
    typeof process.env.GITHUB_REPOSITORY === 'string' &&
    process.env.GITHUB_REPOSITORY.length > 0
  ) {
    const repoName = basename(process.env.GITHUB_REPOSITORY.split('/').pop() ?? '')
    if (repoName && manifest.id !== repoName) {
      errors.push(
        `manifest.id (${JSON.stringify(manifest.id)}) must equal the GitHub repo name (${JSON.stringify(repoName)}). See ${SUBMISSION_DOC}`,
      )
    }
  }

  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    errors.push('manifest.name must be a non-empty string')
  } else if (NAME_FORBIDDEN_WORDS.test(manifest.name)) {
    errors.push(
      `manifest.name must not contain "Obsidian" or "Plugin" as words (case-insensitive); got: ${JSON.stringify(manifest.name)}. See ${SUBMISSION_DOC}`,
    )
  }

  if (typeof manifest.description !== 'string') {
    errors.push('manifest.description must be a string')
  } else if (manifest.description.length > 250) {
    errors.push(
      `manifest.description must be 250 characters or fewer; got: ${manifest.description.length}`,
    )
  } else if (manifest.description.length === 0) {
    errors.push('manifest.description must not be empty')
  }

  if (typeof manifest.author !== 'string' || manifest.author.length === 0) {
    errors.push('manifest.author must be a non-empty string')
  }

  if (typeof manifest.authorUrl !== 'string' || !URL_FORMAT.test(manifest.authorUrl)) {
    errors.push(
      `manifest.authorUrl must be an http(s) URL; got: ${JSON.stringify(manifest.authorUrl)}`,
    )
  }

  if (typeof manifest.isDesktopOnly !== 'boolean') {
    errors.push('manifest.isDesktopOnly must be a boolean')
  }

  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
    errors.push(`manifest.version must match semver \`X.Y.Z[-prerelease]\`; got: ${manifest.version}`)
  }

  if (typeof manifest.minAppVersion !== 'string' || !MINAPP_VERSION.test(manifest.minAppVersion)) {
    errors.push(
      `manifest.minAppVersion must match semver \`X.Y.Z\` (no prerelease or build metadata); got: ${manifest.minAppVersion}`,
    )
  }

  if (typeof pkg.version !== 'string') {
    errors.push('package.json missing version field')
  } else if (typeof manifest.version === 'string' && pkg.version !== manifest.version) {
    errors.push(
      `package.json version (${pkg.version}) does not match manifest.json version (${manifest.version})`,
    )
  }

  if (versions && typeof versions === 'object' && !Array.isArray(versions)) {
    for (const [k, v] of Object.entries(versions)) {
      if (!SEMVER.test(k)) {
        errors.push(`versions.json key not semver: ${k}`)
      }
      if (typeof v !== 'string' || !MINAPP_VERSION.test(v)) {
        errors.push(
          `versions.json[${k}] value must be plain X.Y.Z (Obsidian minAppVersion form); got: ${JSON.stringify(v)}`,
        )
      }
    }

    if (typeof manifest.version === 'string') {
      if (!(manifest.version in versions)) {
        errors.push(
          `versions.json missing entry for current manifest.version (${manifest.version})`,
        )
      } else if (
        typeof manifest.minAppVersion === 'string' &&
        versions[manifest.version] !== manifest.minAppVersion
      ) {
        errors.push(
          `versions.json[${manifest.version}] (${versions[manifest.version]}) does not match manifest.minAppVersion (${manifest.minAppVersion})`,
        )
      }
    }
  } else {
    errors.push('versions.json must be a JSON object')
  }
}

if (errors.length > 0) {
  console.error(`✗ manifest validation failed (${errors.length} error${errors.length === 1 ? '' : 's'}):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(
  `✓ manifest.json + versions.json + package.json valid (version ${manifest.version}, minAppVersion ${manifest.minAppVersion}).`,
)
