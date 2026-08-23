//! Serialization and reviewed C ABI for the no-import WASM artifact.

use std::alloc::{alloc, dealloc, Layout};
use std::ptr;
use std::slice;

use ploy_core::{Color, ErrorBody, Mode, Move, OpponentStyle, RulesError, Snapshot};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(untagged)]
enum WasmResponse<T> {
    Ok { ok: bool, value: T },
    Err { ok: bool, error: ErrorBody },
}

impl<T> WasmResponse<T> {
    fn ok(value: T) -> Self {
        Self::Ok { ok: true, value }
    }

    fn err(error: RulesError) -> Self {
        Self::Err {
            ok: false,
            error: error.to_body(),
        }
    }
}

#[derive(Deserialize)]
struct ModeRequest {
    mode: Mode,
}

#[derive(Deserialize)]
struct SnapshotRequest {
    snapshot: Snapshot,
}

#[derive(Deserialize)]
struct SameSideRequest {
    mode: Mode,
    a: Color,
    b: Color,
}

#[derive(Deserialize)]
struct ColorSnapshotRequest {
    snapshot: Snapshot,
    color: Color,
}

#[derive(Deserialize)]
struct MoveRequest {
    snapshot: Snapshot,
    #[serde(rename = "move")]
    mv: Move,
    color: Color,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChooseMoveRequest {
    snapshot: Snapshot,
    color: Color,
    max_depth: Option<u32>,
    max_nodes: u64,
    random_seed: u32,
    style: Option<OpponentStyle>,
    max_score_loss: Option<i32>,
}

const HEADER: usize = 4;

fn encode_json<T: Serialize>(value: &T) -> Result<Vec<u8>, RulesError> {
    serde_json::to_vec(value).map_err(|error| {
        RulesError::new(
            "invalidSnapshot",
            format!("failed to encode response: {error}"),
        )
    })
}

fn decode_json<'a, T: Deserialize<'a>>(bytes: &'a [u8]) -> Result<T, RulesError> {
    serde_json::from_slice(bytes)
        .map_err(|error| RulesError::invalid_snapshot(format!("malformed request JSON: {error}")))
}

fn response_bytes<T: Serialize>(response: &WasmResponse<T>) -> Vec<u8> {
    match encode_json(response) {
        Ok(payload) => {
            let mut out = Vec::with_capacity(HEADER + payload.len());
            out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
            out.extend_from_slice(&payload);
            out
        }
        Err(error) => {
            let fallback = WasmResponse::<()>::err(error);
            let payload = serde_json::to_vec(&fallback).unwrap_or_else(|_| {
                br#"{"ok":false,"error":{"code":"invalidSnapshot","message":"encode failed"}}"#
                    .to_vec()
            });
            let mut out = Vec::with_capacity(HEADER + payload.len());
            out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
            out.extend_from_slice(&payload);
            out
        }
    }
}

fn write_response<T: Serialize>(response: WasmResponse<T>) -> u32 {
    let bytes = response_bytes(&response);
    let len = bytes.len();
    let ptr = match layout(len) {
        Some(layout) => unsafe { alloc(layout) },
        None => return 0,
    };
    if ptr.is_null() {
        return 0;
    }
    unsafe {
        ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, len);
    }
    ptr as u32
}

fn request_slice<'a>(ptr: u32, len: u32) -> Result<&'a [u8], RulesError> {
    if len == 0 {
        return Ok(&[]);
    }
    if ptr == 0 {
        return Err(RulesError::invalid_snapshot("null request pointer"));
    }
    Ok(unsafe { slice::from_raw_parts(ptr as *const u8, len as usize) })
}

fn layout(len: usize) -> Option<Layout> {
    Layout::from_size_align(len, 1).ok()
}

fn handle<Q, T>(ptr: u32, len: u32, run: impl FnOnce(Q) -> Result<T, RulesError>) -> u32
where
    Q: for<'de> Deserialize<'de>,
    T: Serialize,
{
    match request_slice(ptr, len).and_then(decode_json).and_then(run) {
        Ok(value) => write_response(WasmResponse::ok(value)),
        Err(error) => write_response(WasmResponse::<T>::err(error)),
    }
}

#[no_mangle]
pub extern "C" fn ploy_alloc(len: u32) -> u32 {
    if len == 0 {
        return 0;
    }
    let Some(layout) = layout(len as usize) else {
        return 0;
    };
    let ptr = unsafe { alloc(layout) };
    if ptr.is_null() {
        0
    } else {
        ptr as u32
    }
}

#[no_mangle]
pub extern "C" fn ploy_dealloc(ptr: u32, len: u32) {
    if ptr == 0 || len == 0 {
        return;
    }
    if let Some(layout) = layout(len as usize) {
        unsafe { dealloc(ptr as *mut u8, layout) };
    }
}

#[no_mangle]
pub extern "C" fn create_game(ptr: u32, len: u32) -> u32 {
    handle(ptr, len, |request: ModeRequest| {
        Ok(ploy_core::create_game(request.mode))
    })
}

#[no_mangle]
pub extern "C" fn controller_for_turn(ptr: u32, len: u32) -> u32 {
    handle(ptr, len, |request: SnapshotRequest| {
        ploy_core::controller_for_turn(&request.snapshot)
    })
}

#[no_mangle]
pub extern "C" fn same_side(ptr: u32, len: u32) -> u32 {
    handle(ptr, len, |request: SameSideRequest| {
        Ok(ploy_core::same_side(request.mode, request.a, request.b))
    })
}

#[no_mangle]
pub extern "C" fn legal_moves(ptr: u32, len: u32) -> u32 {
    handle(ptr, len, |request: ColorSnapshotRequest| {
        ploy_core::legal_moves(&request.snapshot, request.color)
    })
}

#[no_mangle]
pub extern "C" fn is_legal(ptr: u32, len: u32) -> u32 {
    handle(ptr, len, |request: MoveRequest| {
        ploy_core::is_legal(&request.snapshot, &request.mv, request.color)
    })
}

#[no_mangle]
pub extern "C" fn apply_move(ptr: u32, len: u32) -> u32 {
    handle(ptr, len, |request: MoveRequest| {
        ploy_core::apply_move(&request.snapshot, &request.mv, request.color)
    })
}

#[no_mangle]
pub extern "C" fn choose_move(ptr: u32, len: u32) -> u32 {
    handle(ptr, len, |request: ChooseMoveRequest| {
        ploy_core::choose_move_with_profile(
            &request.snapshot,
            request.color,
            request.max_depth.unwrap_or(2),
            request.max_nodes,
            request.random_seed,
            request.style.unwrap_or(OpponentStyle::Balanced),
            request.max_score_loss.unwrap_or(12),
        )
    })
}

pub use ploy_core::version;
