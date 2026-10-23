//! Authenticated HTTP sync backed by the same SQLite library and reconciliation as clients.
pub mod config;

use anyhow::{Context, Result};
use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, FromRequest, Request, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use notewren_core::Library;
use notewren_sync::{
    apply_operation, CreateLibraryRequest, CreateLibraryResponse, PullRequest, PullResponse,
    PushRequest, PushResponse,
};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use config::ServerConfig;

#[derive(Clone)]
struct AppState {
    store: Arc<Mutex<Store>>,
    admin_hash: [u8; 32],
}

struct Store {
    directory: PathBuf,
    catalog: Connection,
}

/// Opens durable storage. The caller owns listener binding and shutdown.
pub fn router(config: &ServerConfig) -> Result<Router> {
    config.validate()?;
    let mut directory = std::fs::DirBuilder::new();
    directory.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        directory.mode(0o700);
    }
    directory
        .create(&config.data_dir)
        .context("Cannot create server data directory")?;
    let catalog = Connection::open(config.data_dir.join("catalog.sqlite"))
        .context("Cannot open library catalog")?;
    catalog.busy_timeout(Duration::from_secs(5))?;
    catalog.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
         CREATE TABLE IF NOT EXISTS libraries (
             id TEXT PRIMARY KEY,
             token_hash BLOB NOT NULL CHECK(length(token_hash) = 32)
         );",
    )?;
    let state = AppState {
        store: Arc::new(Mutex::new(Store {
            directory: config.data_dir.clone(),
            catalog,
        })),
        admin_hash: token_hash(&config.admin_token),
    };
    Ok(Router::new()
        .route("/v1/libraries", post(create_library))
        .route("/v1/sync/pull", post(pull))
        .route("/v1/sync/push", post(push))
        .fallback(|| async {
            ApiError::new(StatusCode::NOT_FOUND, "not_found", "Unknown endpoint")
        })
        .method_not_allowed_fallback(|| async {
            ApiError::new(
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
                "Use POST for this endpoint",
            )
        })
        .layer(DefaultBodyLimit::max(config.max_body_bytes))
        .with_state(state))
}

fn token_hash(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}

fn bearer(request: &Request) -> ApiResult<[u8; 32]> {
    if request.uri().query().is_some() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "query_not_allowed",
            "Send credentials in Authorization, never in URLs",
        ));
    }
    let authorisation = request.headers().get_all(header::AUTHORIZATION);
    let mut values = authorisation.iter();
    let value = values
        .next()
        .and_then(|value| value.to_str().ok())
        .ok_or_else(ApiError::unauthorised)?;
    if values.next().is_some() {
        return Err(ApiError::unauthorised());
    }
    let (scheme, token) = value.split_once(' ').ok_or_else(ApiError::unauthorised)?;
    if !scheme.eq_ignore_ascii_case("bearer") || !config::valid_token(token) {
        return Err(ApiError::unauthorised());
    }
    Ok(token_hash(token))
}

async fn body<T: DeserializeOwned>(request: Request, state: &AppState) -> ApiResult<T> {
    let json = request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("application/json"));
    if !json {
        return Err(ApiError::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "content_type",
            "Content-Type must be application/json",
        ));
    }
    let bytes = tokio::time::timeout(Duration::from_secs(15), Bytes::from_request(request, state))
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::REQUEST_TIMEOUT,
                "body_timeout",
                "Request body timed out",
            )
        })?
        .map_err(|error| {
            if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
                ApiError::new(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "body_too_large",
                    "Request exceeds the configured body limit",
                )
            } else {
                ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "invalid_body",
                    "Could not read request body",
                )
            }
        })?;
    serde_json::from_slice(&bytes).map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_json",
            "JSON does not match the endpoint request",
        )
    })
}

async fn create_library(State(state): State<AppState>, request: Request) -> ApiResult<Response> {
    let provided = bearer(&request)?;
    if !bool::from(provided.ct_eq(&state.admin_hash)) {
        return Err(ApiError::unauthorised());
    }
    let input: CreateLibraryRequest = body(request, &state).await?;
    if !config::valid_token(&input.token) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_token",
            "Library token must contain 32 to 512 printable ASCII bytes without spaces",
        ));
    }
    stored(state, move |store| {
        let hash = token_hash(&input.token);
        let path = store.directory.join(format!("{}.sqlite", input.library_id));
        // The catalog transaction also serialises provisioners in separate processes.
        let tx = store
            .catalog
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| ApiError::storage())?;
        let existing: Option<Vec<u8>> = tx
            .query_row(
                "SELECT token_hash FROM libraries WHERE id=?1",
                [input.library_id.to_string()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| ApiError::storage())?;
        let status = if let Some(existing) = existing {
            if !bool::from(existing.as_slice().ct_eq(hash.as_slice())) {
                return Err(ApiError::new(
                    StatusCode::CONFLICT,
                    "library_exists",
                    "Library already exists with another token",
                ));
            }
            StatusCode::OK
        } else {
            let mut library = Library::open(path).map_err(|_| ApiError::storage())?;
            library
                .bind_library(input.library_id)
                .map_err(|_| ApiError::storage())?;
            tx.execute(
                "INSERT INTO libraries(id,token_hash) VALUES (?1,?2)",
                params![input.library_id.to_string(), hash.as_slice()],
            )
            .map_err(|_| ApiError::storage())?;
            StatusCode::CREATED
        };
        tx.commit().map_err(|_| ApiError::storage())?;
        Ok((
            status,
            Json(CreateLibraryResponse {
                library_id: input.library_id,
            }),
        )
            .into_response())
    })
    .await
}

async fn pull(State(state): State<AppState>, request: Request) -> ApiResult<Response> {
    let hash = bearer(&request)?;
    let input: PullRequest = body(request, &state).await?;
    stored(state, move |store| {
        let library = store.authorised_library(input.library_id, &hash)?;
        let snapshot = library.snapshot().map_err(|_| ApiError::storage())?;
        Ok(Json(PullResponse { snapshot }).into_response())
    })
    .await
}

async fn push(State(state): State<AppState>, request: Request) -> ApiResult<Response> {
    let hash = bearer(&request)?;
    let input: PushRequest = body(request, &state).await?;
    stored(state, move |store| {
        let mut library = store.authorised_library(input.operation.library_id, &hash)?;
        let receipt = apply_operation(&mut library, &input.operation).map_err(|error| {
            if error.downcast_ref::<rusqlite::Error>().is_some() {
                ApiError::storage()
            } else {
                ApiError::new(StatusCode::CONFLICT, "invalid_operation", "Operation conflicts with immutable IDs or has invalid ancestry; retain local edits and inspect the operation")
            }
        })?;
        Ok(Json(PushResponse { receipt }).into_response())
    }).await
}

impl Store {
    fn authorised_library(&self, id: Uuid, hash: &[u8; 32]) -> ApiResult<Library> {
        let expected: Option<Vec<u8>> = self
            .catalog
            .query_row(
                "SELECT token_hash FROM libraries WHERE id=?1",
                [id.to_string()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| ApiError::storage())?;
        let expected = expected.ok_or_else(ApiError::unauthorised)?;
        if !bool::from(expected.as_slice().ct_eq(hash.as_slice())) {
            return Err(ApiError::unauthorised());
        }
        let path = self.directory.join(format!("{id}.sqlite"));
        // A missing database is a storage failure, never permission to create an empty library.
        if !path.is_file() {
            return Err(ApiError::storage());
        }
        let library = Library::open(path).map_err(|_| ApiError::storage())?;
        if library.library_id().map_err(|_| ApiError::storage())? != id {
            return Err(ApiError::storage());
        }
        Ok(library)
    }
}

async fn stored<T: Send + 'static>(
    state: AppState,
    work: impl FnOnce(&mut Store) -> ApiResult<T> + Send + 'static,
) -> ApiResult<T> {
    tokio::task::spawn_blocking(move || {
        // All reads and writes share this lock. SQLite commits the operation and receipt together.
        let mut store = state.store.lock().map_err(|_| ApiError::storage())?;
        work(&mut store)
    })
    .await
    .map_err(|_| ApiError::storage())?
}

type ApiResult<T> = std::result::Result<T, ApiError>;

struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: &'static str,
}
impl ApiError {
    fn new(status: StatusCode, code: &'static str, message: &'static str) -> Self {
        Self {
            status,
            code,
            message,
        }
    }
    fn unauthorised() -> Self {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "unauthorised",
            "A valid bearer token for this endpoint and library is required",
        )
    }
    fn storage() -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "storage_error", "Server storage is unavailable; retain local edits and retry after the server is repaired")
    }
}
#[derive(Serialize)]
struct ErrorBody {
    error: ErrorDetail,
}
#[derive(Serialize)]
struct ErrorDetail {
    code: &'static str,
    message: &'static str,
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = (
            self.status,
            Json(ErrorBody {
                error: ErrorDetail {
                    code: self.code,
                    message: self.message,
                },
            }),
        )
            .into_response();
        if self.status == StatusCode::UNAUTHORIZED {
            response.headers_mut().insert(
                header::WWW_AUTHENTICATE,
                axum::http::HeaderValue::from_static("Bearer"),
            );
        }
        response
    }
}
