# 0006. The Users API is designed contract first

- **Status:** accepted
- **Date:** 2026-11-18
- **Phase:** 0

## Context

The brief says what it wants to learn from the API: how the contract is designed, how the
frontend and backend communicate, and how validation, failures and asynchronous behavior are
handled. The signup form has many states that depend on exactly how the API can fail.

## Options considered

1. **Contract first, with shared schemas.** The contract is written before the code. The same
   schemas validate on the client and on the server. Errors follow RFC 9457 problem details
   with stable machine codes. Create is idempotent through an `Idempotency-Key`.
2. **Implementation first with ad hoc JSON errors.** Faster to start, but the client ends up
   matching on message text and the two sides drift.
3. **An OpenAPI document with code generation.** A standard artifact and generated clients,
   at the price of a toolchain that three operations do not justify.
4. **An RPC layer** such as tRPC. Type safety for free, but the contract becomes a library
   detail instead of something a reviewer can read.

## Decision

Write the contract first. Shared schemas validate on both sides: the client for the user's
benefit, the server as the authority. Errors are RFC 9457 problem details with stable codes.
Create is idempotent.

## Consequences

- The client maps error codes to UI states in one place.
- A retry or a double submit cannot create a second user.
- `docs/api.md` can show an example for every status code, taken from the contract.
- A little more design before the first endpoint exists.
- **Cost to change later:** low for adding fields and operations. Changing the error format
  after the client depends on it would touch every state of the form.
