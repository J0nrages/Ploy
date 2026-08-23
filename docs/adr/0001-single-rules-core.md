# Use one Rust/WASM rules and search core

Ploy uses one Rust core for rules and two-player lookahead, compiled as a no-import WebAssembly artifact for the browser Worker and Tauri webview. Private downstream services must consume that same artifact rather than implement their own move generator or terminal rules. If a required host cannot execute the artifact, implementation stops until the architecture is explicitly revised instead of adding a second engine.
