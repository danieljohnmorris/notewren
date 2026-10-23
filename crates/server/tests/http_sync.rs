use notewren_core::{
    Library, LibrarySnapshot, Note, OperationReceipt, RevisionKind, SyncOperation,
};
use notewren_server::{
    config::{ServerConfig, DEFAULT_MAX_BODY_BYTES},
    router,
};
use notewren_sync::{
    sync_now, CreateLibraryRequest, CreateLibraryResponse, PullRequest, PullResponse, PushRequest,
    PushResponse, SyncConfig,
};
use reqwest::{Client, StatusCode};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::{sync::oneshot, task::JoinHandle};
use uuid::Uuid;

const ADMIN: &str = "test-only-provisioning-token-32-bytes-minimum";
const TOKEN: &str = "test-only-library-token-32-bytes-minimum";
const WRONG: &str = "test-only-wrong-token-32-bytes-minimum";

struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("notewren-http-{}", Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

struct Running {
    url: String,
    shutdown: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<()>>,
}
impl Running {
    async fn start(path: &Path, max_body_bytes: usize) -> Self {
        let config = ServerConfig {
            bind: "127.0.0.1:0".parse().unwrap(),
            data_dir: path.to_owned(),
            admin_token: ADMIN.into(),
            max_body_bytes,
        };
        let app = router(&config).unwrap();
        let listener = tokio::net::TcpListener::bind(config.bind).await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (shutdown, receiver) = oneshot::channel();
        let task = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = receiver.await;
                })
                .await
                .unwrap();
        });
        Self {
            url,
            shutdown: Some(shutdown),
            task: Some(task),
        }
    }
    async fn stop(mut self) {
        self.shutdown.take().unwrap().send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(10), self.task.take().unwrap())
            .await
            .unwrap()
            .unwrap();
    }
}
impl Drop for Running {
    fn drop(&mut self) {
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

fn http() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap()
}

async fn provision(url: &str, id: Uuid, token: &str) -> reqwest::Response {
    http()
        .post(format!("{url}/v1/libraries"))
        .bearer_auth(ADMIN)
        .json(&CreateLibraryRequest {
            library_id: id,
            token: token.into(),
        })
        .send()
        .await
        .unwrap()
}

async fn send_operation(config: &SyncConfig, operation: &SyncOperation) -> reqwest::Response {
    http()
        .post(format!("{}/v1/sync/push", config.server_url))
        .bearer_auth(&config.token)
        .json(&PushRequest {
            operation: operation.clone(),
        })
        .send()
        .await
        .unwrap()
}

async fn push(config: &SyncConfig, operation: &SyncOperation) -> OperationReceipt {
    let response = send_operation(config, operation).await;
    assert_eq!(response.status(), StatusCode::OK);
    response.json::<PushResponse>().await.unwrap().receipt
}

async fn pull(config: &SyncConfig) -> LibrarySnapshot {
    let response = http()
        .post(format!("{}/v1/sync/pull", config.server_url))
        .bearer_auth(&config.token)
        .json(&PullRequest {
            library_id: config.library_id,
        })
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    response.json::<PullResponse>().await.unwrap().snapshot
}

struct Fixture {
    server: Option<Running>,
    a: Library,
    b: Library,
    note: Note,
    id: Uuid,
    directory: Directory,
}
impl Fixture {
    async fn new(body: &str) -> Self {
        let directory = Directory::new();
        let server = Running::start(&directory.0.join("server"), DEFAULT_MAX_BODY_BYTES).await;
        let id = Uuid::new_v4();
        let created = provision(&server.url, id, TOKEN).await;
        assert_eq!(created.status(), StatusCode::CREATED);
        assert_eq!(
            created
                .json::<CreateLibraryResponse>()
                .await
                .unwrap()
                .library_id,
            id
        );
        let mut a = Library::open(directory.0.join("client-a.sqlite")).unwrap();
        let mut b = Library::open(directory.0.join("client-b.sqlite")).unwrap();
        // Create before binding to exercise offline-first creation through the desktop sync path.
        let note = a.create_note("Title", body).unwrap();
        let config = SyncConfig {
            server_url: server.url.clone(),
            library_id: id,
            token: TOKEN.into(),
        };
        sync_now(&mut a, &config).await.unwrap();
        sync_now(&mut b, &config).await.unwrap();
        assert_eq!(a.snapshot().unwrap(), b.snapshot().unwrap());
        Self {
            server: Some(server),
            a,
            b,
            note,
            id,
            directory,
        }
    }
    fn config(&self) -> SyncConfig {
        SyncConfig {
            server_url: self.server.as_ref().unwrap().url.clone(),
            library_id: self.id,
            token: TOKEN.into(),
        }
    }
    async fn restart(&mut self) {
        self.server.take().unwrap().stop().await;
        self.server =
            Some(Running::start(&self.directory.0.join("server"), DEFAULT_MAX_BODY_BYTES).await);
    }
    async fn converge(&mut self) -> LibrarySnapshot {
        let config = self.config();
        sync_now(&mut self.a, &config).await.unwrap();
        sync_now(&mut self.b, &config).await.unwrap();
        sync_now(&mut self.a, &config).await.unwrap();
        let snapshot = pull(&config).await;
        assert_eq!(self.a.snapshot().unwrap(), snapshot);
        assert_eq!(self.b.snapshot().unwrap(), snapshot);
        assert!(self.a.pending_operations().unwrap().is_empty());
        assert!(self.b.pending_operations().unwrap().is_empty());
        snapshot.validate().unwrap();
        snapshot
    }
}

#[tokio::test]
async fn offline_edits_reconnect_and_all_three_databases_survive_restart() {
    let mut f = Fixture::new("base").await;
    let disconnected = f.config();
    f.server.take().unwrap().stop().await;
    let changed =
        f.a.save_note(
            f.note.id,
            f.note.branch_id,
            "Offline title",
            "offline body",
            f.note.revision_id,
        )
        .unwrap();
    let other =
        f.b.create_note("Independent offline note", "second device")
            .unwrap();
    let pending = f.a.pending_operations().unwrap();
    assert!(sync_now(&mut f.a, &disconnected).await.is_err());
    assert_eq!(f.a.pending_operations().unwrap(), pending);
    assert_eq!(
        f.a.get_note(changed.id, changed.branch_id).unwrap(),
        changed
    );
    // Drop and reopen both independent client connections while the server remains offline.
    let Fixture {
        server,
        a,
        b,
        note,
        id,
        directory,
    } = f;
    assert!(server.is_none());
    drop(a);
    drop(b);
    let a = Library::open(directory.0.join("client-a.sqlite")).unwrap();
    let b = Library::open(directory.0.join("client-b.sqlite")).unwrap();
    assert_eq!(a.pending_operations().unwrap(), pending);
    let server = Some(Running::start(&directory.0.join("server"), DEFAULT_MAX_BODY_BYTES).await);
    let mut f = Fixture {
        server,
        a,
        b,
        note,
        id,
        directory,
    };
    let snapshot = f.converge().await;
    assert_eq!(
        f.b.get_note(changed.id, changed.branch_id).unwrap(),
        changed
    );
    assert_eq!(f.a.get_note(other.id, other.branch_id).unwrap(), other);
    f.restart().await;
    assert_eq!(pull(&f.config()).await, snapshot);
    assert_eq!(f.converge().await, snapshot);
}

#[tokio::test]
async fn identical_and_disjoint_edits_merge_with_both_input_revisions_over_http() {
    for (left, right, expected) in [
        ("same\nbody\n", "same\nbody\n", "same\nbody\n"),
        (
            "ONE\ntwo\nthree\n",
            "one\ntwo\nTHREE\n",
            "ONE\ntwo\nTHREE\n",
        ),
    ] {
        let mut f = Fixture::new("one\ntwo\nthree\n").await;
        let a =
            f.a.save_note(
                f.note.id,
                f.note.branch_id,
                "Title",
                left,
                f.note.revision_id,
            )
            .unwrap();
        let b =
            f.b.save_note(
                f.note.id,
                f.note.branch_id,
                "Title",
                right,
                f.note.revision_id,
            )
            .unwrap();
        let snapshot = f.converge().await;
        assert_eq!(snapshot.branches.len(), 1);
        let head = f.a.get_note(f.note.id, f.note.branch_id).unwrap();
        assert_eq!(head.body, expected);
        let history = f.a.history(f.note.id, f.note.branch_id).unwrap();
        assert_eq!(history[0].kind, RevisionKind::Merge);
        assert_eq!(history[0].parents.len(), 2);
        assert!(history[0].parents.contains(&a.revision_id));
        assert!(history[0].parents.contains(&b.revision_id));
        assert!(history
            .iter()
            .any(|revision| revision.id == f.note.revision_id));
        f.restart().await;
        assert_eq!(pull(&f.config()).await, snapshot);
    }
}

#[tokio::test]
async fn body_and_title_conflicts_preserve_full_drafts_and_deduplicate_across_restart() {
    for (title_a, body_a, title_b, body_b) in [
        ("Title", "accepted body", "Title", "incoming body"),
        ("Title A", "ONE\ntwo\n", "Title B", "one\nTWO\n"),
    ] {
        let mut f = Fixture::new("one\ntwo\n").await;
        let a =
            f.a.save_note(
                f.note.id,
                f.note.branch_id,
                title_a,
                body_a,
                f.note.revision_id,
            )
            .unwrap();
        let b =
            f.b.save_note(
                f.note.id,
                f.note.branch_id,
                title_b,
                body_b,
                f.note.revision_id,
            )
            .unwrap();
        let op_a = f.a.pending_operations().unwrap().remove(0);
        let op_b = f.b.pending_operations().unwrap().remove(0);
        assert!(!push(&f.config(), &op_a).await.conflict);
        let receipt = push(&f.config(), &op_b).await;
        assert!(receipt.conflict);
        let before = pull(&f.config()).await;
        assert_eq!(push(&f.config(), &op_b).await, receipt);
        f.restart().await;
        assert_eq!(push(&f.config(), &op_b).await, receipt);
        assert_eq!(pull(&f.config()).await, before);
        // Neither client acknowledged the earlier responses. sync_now must safely retry both.
        let snapshot = f.converge().await;
        assert_eq!(snapshot.branches.len(), 2);
        let accepted = f.a.get_note(f.note.id, f.note.branch_id).unwrap();
        let conflict = f.b.get_note(f.note.id, receipt.result_branch_id).unwrap();
        assert_eq!(
            (accepted.title.as_str(), accepted.body.as_str()),
            (title_a, body_a)
        );
        assert_eq!(
            (conflict.title.as_str(), conflict.body.as_str()),
            (title_b, body_b)
        );
        let history = f.b.history(f.note.id, receipt.result_branch_id).unwrap();
        assert!(history.iter().any(|revision| revision.id == b.revision_id));
        assert!(snapshot
            .revisions
            .iter()
            .any(|revision| revision.id == a.revision_id));
        let mut reused = op_b.clone();
        reused.revision.body = "different payload using the same operation ID".into();
        assert_eq!(
            send_operation(&f.config(), &reused).await.status(),
            StatusCode::CONFLICT
        );
        assert_eq!(pull(&f.config()).await, snapshot);
    }
}

#[tokio::test]
async fn explicitly_separate_branches_remain_separate_after_sync() {
    let mut f = Fixture::new("one\ntwo\n").await;
    let alternative =
        f.b.create_branch(f.note.id, f.note.revision_id, "Deliberate alternative")
            .unwrap();
    f.b.save_note(
        f.note.id,
        alternative.id,
        "Title",
        "one\nTWO\n",
        alternative.head_revision_id,
    )
    .unwrap();
    f.a.save_note(
        f.note.id,
        f.note.branch_id,
        "Title",
        "ONE\ntwo\n",
        f.note.revision_id,
    )
    .unwrap();
    let snapshot = f.converge().await;
    assert_eq!(snapshot.branches.len(), 2);
    assert_eq!(
        f.a.get_note(f.note.id, f.note.branch_id).unwrap().body,
        "ONE\ntwo\n"
    );
    assert_eq!(
        f.a.get_note(f.note.id, alternative.id).unwrap().body,
        "one\nTWO\n"
    );
    assert!(!snapshot
        .revisions
        .iter()
        .any(|revision| revision.kind == RevisionKind::Merge
            || revision.kind == RevisionKind::Conflict));
    f.restart().await;
    assert_eq!(f.converge().await, snapshot);
}

#[tokio::test]
async fn child_before_parent_and_retries_preserve_latest_head_and_ancestry() {
    let mut f = Fixture::new("base").await;
    let first =
        f.a.save_note(
            f.note.id,
            f.note.branch_id,
            "Title",
            "offline first",
            f.note.revision_id,
        )
        .unwrap();
    let latest =
        f.a.save_note(
            f.note.id,
            f.note.branch_id,
            "Title",
            "offline latest",
            first.revision_id,
        )
        .unwrap();
    let operations = f.a.pending_operations().unwrap();
    let child = push(&f.config(), &operations[1]).await;
    assert!(!child.conflict);
    f.restart().await;
    assert!(!push(&f.config(), &operations[0]).await.conflict);
    assert_eq!(push(&f.config(), &operations[1]).await, child);
    let snapshot = f.converge().await;
    assert_eq!(snapshot.branches.len(), 1);
    assert_eq!(f.b.get_note(f.note.id, f.note.branch_id).unwrap(), latest);
    assert_eq!(f.b.history(f.note.id, f.note.branch_id).unwrap().len(), 3);
}

#[tokio::test]
async fn simultaneous_http_pushes_are_serialised_without_losing_either_edit() {
    let mut f = Fixture::new("one\ntwo\nthree\n").await;
    f.a.save_note(
        f.note.id,
        f.note.branch_id,
        "Title",
        "ONE\ntwo\nthree\n",
        f.note.revision_id,
    )
    .unwrap();
    f.b.save_note(
        f.note.id,
        f.note.branch_id,
        "Title",
        "one\ntwo\nTHREE\n",
        f.note.revision_id,
    )
    .unwrap();
    let a = f.a.pending_operations().unwrap().remove(0);
    let b = f.b.pending_operations().unwrap().remove(0);
    let config = f.config();
    let (left, right) = tokio::join!(push(&config, &a), push(&config, &b));
    assert!(!left.conflict && !right.conflict);
    let snapshot = f.converge().await;
    assert_eq!(snapshot.branches.len(), 1);
    assert_eq!(
        f.b.get_note(f.note.id, f.note.branch_id).unwrap().body,
        "ONE\ntwo\nTHREE\n"
    );
    let head = &f.a.history(f.note.id, f.note.branch_id).unwrap()[0];
    assert!(head.parents.contains(&a.revision.id));
    assert!(head.parents.contains(&b.revision.id));
}

async fn assert_error(response: reqwest::Response, status: StatusCode, code: &str) {
    assert_eq!(response.status(), status);
    assert!(response.headers()[reqwest::header::CONTENT_TYPE]
        .to_str()
        .unwrap()
        .starts_with("application/json"));
    let text = response.text().await.unwrap();
    for secret in [ADMIN, TOKEN, WRONG] {
        assert!(!text.contains(secret));
    }
    let json: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(json["error"]["code"], code);
    assert!(json["error"]["message"]
        .as_str()
        .is_some_and(|message| !message.is_empty()));
}

#[tokio::test]
async fn authentication_is_scoped_to_library_and_errors_do_not_echo_credentials() {
    let f = Fixture::new("private").await;
    let config = f.config();
    let client = http();
    let create = CreateLibraryRequest {
        library_id: Uuid::new_v4(),
        token: TOKEN.into(),
    };
    assert_error(
        client
            .post(format!("{}/v1/libraries", config.server_url))
            .json(&create)
            .send()
            .await
            .unwrap(),
        StatusCode::UNAUTHORIZED,
        "unauthorised",
    )
    .await;
    assert_error(
        client
            .post(format!("{}/v1/libraries", config.server_url))
            .bearer_auth(TOKEN)
            .json(&create)
            .send()
            .await
            .unwrap(),
        StatusCode::UNAUTHORIZED,
        "unauthorised",
    )
    .await;
    for token in [None, Some(WRONG), Some(ADMIN)] {
        let mut request = client
            .post(format!("{}/v1/sync/pull", config.server_url))
            .json(&PullRequest { library_id: f.id });
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        assert_error(
            request.send().await.unwrap(),
            StatusCode::UNAUTHORIZED,
            "unauthorised",
        )
        .await;
    }
    let other_id = Uuid::new_v4();
    assert_eq!(
        provision(&config.server_url, other_id, WRONG)
            .await
            .status(),
        StatusCode::CREATED
    );
    assert_error(
        client
            .post(format!("{}/v1/sync/pull", config.server_url))
            .bearer_auth(TOKEN)
            .json(&PullRequest {
                library_id: other_id,
            })
            .send()
            .await
            .unwrap(),
        StatusCode::UNAUTHORIZED,
        "unauthorised",
    )
    .await;
    let mut attacker = Library::open(f.directory.0.join("wrong-library.sqlite")).unwrap();
    attacker.bind_library(other_id).unwrap();
    attacker
        .create_note("Attempt", "must not enter the other library")
        .unwrap();
    let operation = attacker.pending_operations().unwrap().remove(0);
    assert_error(
        send_operation(&config, &operation).await,
        StatusCode::UNAUTHORIZED,
        "unauthorised",
    )
    .await;
    let other_config = SyncConfig {
        server_url: config.server_url.clone(),
        library_id: other_id,
        token: WRONG.into(),
    };
    assert!(pull(&other_config).await.revisions.is_empty());
    assert_eq!(
        provision(&config.server_url, f.id, TOKEN).await.status(),
        StatusCode::OK
    );
    assert_error(
        provision(&config.server_url, f.id, WRONG).await,
        StatusCode::CONFLICT,
        "library_exists",
    )
    .await;
    assert_error(
        client
            .post(format!("{}/v1/sync/pull?token={TOKEN}", config.server_url))
            .bearer_auth(TOKEN)
            .json(&PullRequest { library_id: f.id })
            .send()
            .await
            .unwrap(),
        StatusCode::BAD_REQUEST,
        "query_not_allowed",
    )
    .await;
    assert_error(
        client
            .post(format!("{}/v1/sync/pull", config.server_url))
            .bearer_auth(TOKEN)
            .header("Content-Type", "application/json")
            .body(format!("{{invalid:{TOKEN}"))
            .send()
            .await
            .unwrap(),
        StatusCode::BAD_REQUEST,
        "invalid_json",
    )
    .await;
    assert_error(
        client
            .get(format!("{}/v1/sync/pull", config.server_url))
            .send()
            .await
            .unwrap(),
        StatusCode::METHOD_NOT_ALLOWED,
        "method_not_allowed",
    )
    .await;
    assert_error(
        client
            .post(format!("{}/missing", config.server_url))
            .send()
            .await
            .unwrap(),
        StatusCode::NOT_FOUND,
        "not_found",
    )
    .await;
    let connection =
        rusqlite::Connection::open(f.directory.0.join("server/catalog.sqlite")).unwrap();
    let stored: Vec<u8> = connection
        .query_row(
            "SELECT token_hash FROM libraries WHERE id=?1",
            [f.id.to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(stored.len(), 32);
    assert_ne!(stored, TOKEN.as_bytes());
}

#[tokio::test]
async fn rejected_pushes_leave_server_state_and_client_outbox_intact() {
    let mut f = Fixture::new("base").await;
    f.a.save_note(
        f.note.id,
        f.note.branch_id,
        "Title",
        "local unsent edit",
        f.note.revision_id,
    )
    .unwrap();
    let pending = f.a.pending_operations().unwrap();
    let before = pull(&f.config()).await;
    let mut wrong = f.config();
    wrong.token = WRONG.into();
    assert!(sync_now(&mut f.a, &wrong).await.is_err());
    assert_eq!(f.a.pending_operations().unwrap(), pending);
    assert_error(
        send_operation(&wrong, &pending[0]).await,
        StatusCode::UNAUTHORIZED,
        "unauthorised",
    )
    .await;
    let config = f.config();
    assert_error(
        http()
            .post(format!("{}/v1/sync/push", config.server_url))
            .json(&PushRequest {
                operation: pending[0].clone(),
            })
            .send()
            .await
            .unwrap(),
        StatusCode::UNAUTHORIZED,
        "unauthorised",
    )
    .await;
    let mut invalid = pending[0].clone();
    invalid.revision.parents = vec![Uuid::new_v4()];
    assert_error(
        send_operation(&config, &invalid).await,
        StatusCode::CONFLICT,
        "invalid_operation",
    )
    .await;
    assert_eq!(pull(&config).await, before);
    assert_eq!(f.a.pending_operations().unwrap(), pending);
    assert_error(
        http()
            .post(format!("{}/v1/sync/pull", config.server_url))
            .bearer_auth(TOKEN)
            .body("{}")
            .send()
            .await
            .unwrap(),
        StatusCode::UNSUPPORTED_MEDIA_TYPE,
        "content_type",
    )
    .await;
    f.converge().await;
    assert_eq!(
        f.b.get_note(f.note.id, f.note.branch_id).unwrap().body,
        "local unsent edit"
    );
}

#[tokio::test]
async fn fixed_and_chunked_request_bodies_are_bounded() {
    let directory = Directory::new();
    let server = Running::start(&directory.0.join("server"), 1024).await;
    assert_error(
        http()
            .post(format!("{}/v1/libraries", server.url))
            .bearer_auth(ADMIN)
            .header("Content-Type", "application/json")
            .body("x".repeat(2048))
            .send()
            .await
            .unwrap(),
        StatusCode::PAYLOAD_TOO_LARGE,
        "body_too_large",
    )
    .await;
    let address = server.url.trim_start_matches("http://").to_owned();
    let response = tokio::task::spawn_blocking(move || {
        use std::io::{Read, Write};
        let mut socket = std::net::TcpStream::connect(address).unwrap();
        socket.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
        socket.set_write_timeout(Some(Duration::from_secs(10))).unwrap();
        let request = format!("POST /v1/libraries HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {ADMIN}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n800\r\n{}\r\n0\r\n\r\n", "x".repeat(2048));
        socket.write_all(request.as_bytes()).unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        response
    }).await.unwrap();
    assert!(response.starts_with("HTTP/1.1 413"));
    assert!(response.contains("body_too_large"));
    assert!(!response.contains(ADMIN));
    server.stop().await;
}
