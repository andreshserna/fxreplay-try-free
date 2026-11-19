# 0003. Persistence behind a repository interface; the platform is decided in Phase 1

- **Status:** accepted for the interface. The hosting platform and the database are **open**.
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The brief leaves persistence open (in-memory, a file, a database, Notion) and asks for the
choice, its rationale and its trade-offs. A reviewer must be able to run the project without
creating an account anywhere. Email has to be unique, and a rule that lives only in
application code breaks under concurrent requests.

## Options considered

1. **Call the database directly from the endpoints.** Less code today. Tests then need a
   real database, and the storage choice leaks into every handler.
2. **A small repository interface** with one production implementation and an in-memory one
   for tests and local runs.
3. **In-memory only.** Honest for a demo and allowed by the brief, but nothing survives a
   restart and there is no real uniqueness guarantee to show.

## Decision

Persistence sits behind a small repository interface with an in-memory implementation for
tests. Email is normalized and unique at the database level. The project runs locally with
no account. The starting assumption for the platform is Cloudflare Workers with D1 (one
platform for hosting, edge logic, CDN, DNS, WAF and rate limiting, plus a real SQL database).
It stays an assumption until Phase 1 confirms it or replaces it.

## Consequences

- API tests are fast and need no network.
- The interface has two implementations from the first day, so it is not speculative.
- A live requirement that changes storage lands in one file.
- **Cost to change later:** low for the storage engine, by design. Higher for the hosting
  platform once edge features (rate limiting, experiment assignment) depend on it.
