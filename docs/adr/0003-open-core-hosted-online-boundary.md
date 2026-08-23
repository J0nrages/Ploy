# Keep hosted online play in a private downstream

## Status

Accepted — 2026-08-23

## Decision

`J0nrages/Ploy` remains the canonical public MIT-licensed home of the rules core, AI, board, local web application, and desktop shell. Hosted online play is developed in private `J0nrages/ploy-online`, which shares history and merges public changes through an `upstream` remote.

Public `main` contains no hosted backend, online client implementation, operational configuration, credentials documentation, or hosted-service tests. It retains a same-tab **Play online** navigation to the unified official product at `https://jonathanrdaniels.com/ploy`.

The private downstream contains the complete application—local and hosted play together—so users do not encounter a separate-looking lobby product. Shared changes land publicly first and are merged downstream; private hosted changes never merge upstream.

Existing public history is not rewritten. Code already released under MIT remains under that license, while future hosted-service implementation is private.

## Consequences

- Public contributors can build and test the complete offline game without service credentials.
- The hosted product may evolve independently without exposing operational implementation.
- The private downstream must regularly merge public `main` and resolve conflicts as an overlay.
- The official website, not the public deployment, is the canonical hosted multiplayer origin.
