# Guides

A dual-axis index into this repository's guides — by concept, and by directory.

## By concept

| Concept | Spec                     | Source                    | Tests                                 |
| ------- | ------------------------ | ------------------------- | ------------------------------------- |
| Budget  | [`budget.md`](budget.md) | [`src/core`](../src/core) | [`tests/src/core`](../tests/src/core) |

## By directory

| Directory  | Guide                    |
| ---------- | ------------------------ |
| `src/core` | [`budget.md`](budget.md) |

## Dependency reference

[`contract.md`](contract.md) is a byte-identical mirror of the guide for
`@orkestrel/contract` — this package's sole runtime dependency. It documents
**that package's** surface (guards, combinators, parsers, and the shape DSL), not
anything sourced in this repo; it is kept here so a reader of this package can see
the primitives it is built from without leaving this guide set.

The directory also holds one byte-identical mirror per declared `@orkestrel/*`
development dependency:

- [`guide.md`](guide.md) mirrors the guide for `@orkestrel/guide`, which powers
  the guides-parity suite (`tests/guides.test.ts`).
- [`test.md`](test.md) mirrors the guide for `@orkestrel/test`, which supplies
  the shared test helpers every suite here imports.
- [`scaffold.md`](scaffold.md) mirrors the guide for `@orkestrel/scaffold`,
  which owns this workspace's structure and its vendored files.
- [`probe.md`](probe.md) mirrors the guide for `@orkestrel/probe`, which runs a
  claim's case and its negative control against this workspace.

## See also

- [`AGENTS.md`](../AGENTS.md) — the pointer to the `@orkestrel/scaffold` coding and orchestration authority.
