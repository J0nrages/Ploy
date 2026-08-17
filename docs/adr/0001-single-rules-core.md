# Use one Rust/WASM rules and search core

Ploy uses one Rust core for rules and two-player lookahead, compiled as a no-import WebAssembly artifact for the browser Worker, Tauri webview, and Convex. This avoids divergent move generators and terminal rules; if the mandatory cross-runtime spike fails, implementation stops until the architecture is explicitly replaced with one TypeScript core rather than adding a second engine.
