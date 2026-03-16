# MiniMaven

A lightweight Maven repository server running as a Cloudflare Worker, backed by R2 object storage. Designed for publishing and resolving both release and pre-release artifacts with minimal operational overhead.

## How it works

MiniMaven implements the subset of the Maven repository protocol that Maven and Gradle clients actually use: `GET`, `HEAD`, and `PUT` over standard Maven path layouts (`{groupId...}/{artifactId}/{version}/{filename}`). There is no database -- R2's flat key-value namespace *is* the repository.

## Endpoints

### `GET /{path}`

Retrieves an artifact from R2 and streams it back. Returns `404` if the key does not exist.

**Special case: `GET /{groupId...}/{artifactId}/maven-metadata.xml`**
GA-level metadata is **not** stored in R2. Instead, it is generated dynamically by listing all version subdirectories under the group/artifact prefix, filtering to release versions only, sorting by semver, and emitting a standard `<metadata>` XML document. The response is cached via the Workers Cache API with a 5-minute TTL. Returns `404` if no release versions exist for the coordinate, or if the path resolves to a group prefix rather than a true GA coordinate.

Version-level metadata (e.g. `/{g}/{a}/{v}/maven-metadata.xml`) is served from R2 like any other file if present.

### `HEAD /{path}`

Returns headers (`Content-Length`, `ETag`, `Last-Modified`) for an artifact without transferring the body. Used by Maven/Gradle to check artifact existence. Returns `404` if the key does not exist.

GA-level `maven-metadata.xml` is handled the same as `GET` (dynamically generated).

### `PUT /{path}` (authenticated)

Requires a `Bearer` token matching the `PUBLISH_TOKEN` secret. Returns `401`/`403` on missing or invalid credentials.

Behavior depends on what is being uploaded:

| Upload target | Behavior |
|---|---|
| `maven-metadata.xml` (or its checksum sidecars) | Silently accepted and **discarded** (returns `200`). The server generates metadata dynamically, so client-pushed copies are unnecessary. |
| Release artifact (version has no hyphen qualifier matching a configured pattern) | **Immutable.** If the key already exists in R2, returns `409 Conflict`. Otherwise stores the artifact and returns `201`. |
| Pre-release artifact (version matches a `PRERELEASE_PATTERNS` entry, e.g. `1.0.0-pr.42`) | **Overwritable.** Stores the artifact unconditionally and returns `201`. This allows CI to republish the same pre-release version. |

Every stored object gets R2 custom metadata: `uploadedAt` (ISO 8601 timestamp) and `prerelease` (`"true"` or `"false"`).

### Any other method

Returns `405 Method Not Allowed` with an `Allow: GET, HEAD, PUT` header.

### Scheduled (cron) -- Cleanup

A cron trigger (daily at 03:00 UTC) runs count-based retention for pre-release artifacts. For each group/artifact coordinate and each configured pattern in `PRERELEASE_PATTERNS`, it keeps the N most recent versions (by upload timestamp) and deletes the rest. Release artifacts are never deleted. If no patterns are configured, cleanup is a no-op.

## Authentication

- **Reads are unauthenticated** -- `GET` and `HEAD` are open.
- **Writes require a Bearer token** -- the `Authorization: Bearer <token>` header must match the `PUBLISH_TOKEN` Cloudflare secret.

## Version classification

A version is classified as pre-release if the portion after the first `-` matches any regex in the `PRERELEASE_PATTERNS` array in `src/version.ts`. All other versions (bare numeric like `1.2.3`, or unrecognized qualifiers) are treated as releases.
