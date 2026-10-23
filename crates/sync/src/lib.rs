//! Shared sync protocol and conservative, deterministic reconciliation.
use anyhow::{ensure, Context, Result};
use notewren_core::Library;
pub use notewren_core::{
    Branch, LibrarySnapshot, OperationAction, OperationReceipt, Revision, RevisionKind,
    SyncOperation,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub server_url: String,
    pub library_id: Uuid,
    pub token: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct CreateLibraryRequest {
    pub library_id: Uuid,
    pub token: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateLibraryResponse {
    pub library_id: Uuid,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PullRequest {
    pub library_id: Uuid,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PullResponse {
    pub snapshot: LibrarySnapshot,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PushRequest {
    pub operation: SyncOperation,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PushResponse {
    pub receipt: OperationReceipt,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncReport {
    pub pushed: usize,
    pub conflicts: Vec<Branch>,
    pub snapshot: LibrarySnapshot,
}

/// Call inside the server's per-library lock. Storage and retry receipts are atomic.
pub fn apply_operation(
    library: &mut Library,
    operation: &SyncOperation,
) -> Result<OperationReceipt> {
    library.sync_transaction(|state, receipts| reconcile(state, receipts, operation))
}

/// Reconciliation mutates only the provided transaction state. An error must roll it back.
pub fn reconcile(
    state: &mut LibrarySnapshot,
    receipts: &mut Vec<OperationReceipt>,
    operation: &SyncOperation,
) -> Result<OperationReceipt> {
    ensure!(
        state.library_id == operation.library_id,
        "Operation library ID mismatch"
    );
    if let Some(receipt) = receipts
        .iter()
        .find(|r| r.operation.operation_id == operation.operation_id)
    {
        ensure!(
            receipt.operation == *operation,
            "Operation ID was reused with different content"
        );
        return Ok(receipt.clone());
    }
    ensure!(
        operation.note_id == operation.revision.note_id
            && operation.branch_id == operation.revision.branch_id,
        "Revision target mismatch"
    );
    ensure!(
        operation.branch.id == operation.branch_id
            && operation.branch.note_id == operation.note_id
            && operation.branch.head_revision_id == operation.revision.id,
        "Branch target mismatch"
    );
    ensure!(
        !operation.branch.name.trim().is_empty(),
        "Branch name cannot be empty"
    );
    if operation.action == OperationAction::Save {
        ensure!(
            operation.base_revision == operation.revision.parents.first().copied(),
            "Base revision does not match ancestry"
        );
        if let Some(expected) = operation.expected_head {
            ensure!(
                operation.revision.parents.contains(&expected),
                "Expected head is not an incoming revision parent"
            );
        }
    } else {
        ensure!(
            operation.expected_head == Some(operation.revision.id),
            "Metadata operation expected head mismatch"
        );
    }
    let existing_target = state
        .branches
        .iter()
        .position(|b| b.id == operation.branch_id);
    if let Some(index) = existing_target {
        ensure!(
            state.branches[index].note_id == operation.note_id,
            "Branch belongs to another note"
        );
        ensure!(
            state.agent_branches.contains(&operation.branch_id) == operation.agent_branch,
            "Agent branch identity cannot change"
        );
    }
    for revision in operation
        .ancestry
        .iter()
        .chain(std::iter::once(&operation.revision))
    {
        ensure!(
            revision.note_id == operation.note_id,
            "Ancestry contains another note"
        );
        insert_revision(state, revision.clone())?;
    }
    for branch in &operation.ancestry_branches {
        ensure!(
            branch.note_id == operation.note_id,
            "Ancestry branch belongs to another note"
        );
        if !state.branches.iter().any(|b| b.id == branch.id) {
            state.branches.push(branch.clone());
            if operation.ancestry_agent_branches.contains(&branch.id) {
                state.agent_branches.insert(branch.id);
            }
        }
    }
    if !state.branches.iter().any(|b| b.id == operation.branch_id) {
        state.branches.push(operation.branch.clone());
    }
    if existing_target.is_none() && operation.agent_branch {
        state.agent_branches.insert(operation.branch_id);
    }
    state.validate()?;
    let target = state
        .branches
        .iter()
        .position(|b| b.id == operation.branch_id)
        .context("Missing target branch")?;
    let current = state.branches[target].clone();
    let mut result_branch_id = current.id;
    let mut conflict = false;

    if operation.action != OperationAction::Save {
        // A stale deletion never hides a concurrently edited draft.
        if existing_target.is_none() || operation.expected_head == Some(current.head_revision_id) {
            if operation.action == OperationAction::Delete
                || (operation.action == OperationAction::Archive && operation.branch.archived)
            {
                ensure!(
                    state.branches.iter().any(|b| b.note_id == current.note_id
                        && b.id != current.id
                        && !b.archived
                        && !state.deleted_branches.contains(&b.id)),
                    "Cannot archive or delete the last active branch"
                );
            }
            match operation.action {
                OperationAction::Rename => {
                    state.branches[target].name = operation.branch.name.clone()
                }
                OperationAction::Archive => {
                    state.branches[target].archived = operation.branch.archived
                }
                OperationAction::Delete => {
                    state.deleted_branches.insert(current.id);
                }
                OperationAction::Save => unreachable!(),
            }
        }
    } else if existing_target.is_none() {
        state.branches[target] = operation.branch.clone();
    } else if is_ancestor(state, operation.revision.id, current.head_revision_id) {
        // The input may already have arrived as ancestry of a later operation.
    } else if let Some(branch) = state.branches.iter().find(|b| {
        b.id != current.id
            && !state.deleted_branches.contains(&b.id)
            && receipts.iter().any(|r| {
                r.conflict && r.result_branch_id == b.id && r.operation.branch_id == current.id
            })
            && is_ancestor(state, operation.revision.id, b.head_revision_id)
    }) {
        result_branch_id = branch.id;
        conflict = true;
    } else if let Some(route) = conflict_route(state, receipts, operation) {
        let branch_index = state
            .branches
            .iter()
            .position(|b| b.id == route)
            .context("Missing conflict branch")?;
        let previous = state.branches[branch_index].head_revision_id;
        let revision = conflict_revision(operation, route, Some(previous));
        state.branches[branch_index].head_revision_id = revision.id;
        insert_revision(state, revision)?;
        result_branch_id = route;
        conflict = true;
    } else if !state.deleted_branches.contains(&current.id)
        && !current.archived
        && is_ancestor(state, current.head_revision_id, operation.revision.id)
    {
        state.branches[target].head_revision_id = operation.revision.id;
    } else {
        let accepted = revision(state, current.head_revision_id)?.clone();
        let merged = if state.deleted_branches.contains(&current.id) || current.archived {
            None
        } else {
            common_ancestor(state, accepted.id, operation.revision.id).and_then(|id| {
                let base = revision(state, id).ok()?;
                let title = merge_scalar(&base.title, &accepted.title, &operation.revision.title)?;
                let body = merge_body(&base.body, &accepted.body, &operation.revision.body)?;
                Some((title, body))
            })
        };
        if let Some((title, body)) = merged {
            let mut parents = vec![accepted.id, operation.revision.id];
            parents.sort_unstable();
            let id = stable_id(
                "merge",
                &[
                    current.id.as_bytes(),
                    parents[0].as_bytes(),
                    parents[1].as_bytes(),
                    title.as_bytes(),
                    body.as_bytes(),
                ],
            );
            let merged = Revision {
                id,
                note_id: operation.note_id,
                branch_id: current.id,
                title,
                body,
                parents,
                kind: RevisionKind::Merge,
                // A merge must be identical on every client. Derive its
                // timestamp from the input revisions rather than wall clock.
                created_at: match (accepted.created_at, operation.revision.created_at) {
                    (Some(left), Some(right)) => Some(left.max(right)),
                    (Some(value), None) | (None, Some(value)) => Some(value),
                    (None, None) => None,
                },
            };
            state.branches[target].head_revision_id = merged.id;
            insert_revision(state, merged)?;
        } else {
            let id = stable_id("conflict-branch", &[operation.operation_id.as_bytes()]);
            let revision = conflict_revision(operation, id, None);
            let branch = Branch {
                id,
                note_id: operation.note_id,
                name: format!("Conflict {}", &operation.operation_id.to_string()[..8]),
                head_revision_id: revision.id,
                archived: false,
            };
            insert_revision(state, revision)?;
            state.branches.push(branch);
            if operation.agent_branch {
                state.agent_branches.insert(id);
            }
            result_branch_id = id;
            conflict = true;
        }
    }
    state.branches.sort_by_key(|b| b.id);
    state.revisions.sort_by_key(|r| r.id);
    state.validate()?;
    let receipt = OperationReceipt {
        operation: operation.clone(),
        result_branch_id,
        conflict,
    };
    receipts.push(receipt.clone());
    Ok(receipt)
}

fn conflict_route(
    state: &LibrarySnapshot,
    receipts: &[OperationReceipt],
    operation: &SyncOperation,
) -> Option<Uuid> {
    let distances = ancestors(state, operation.revision.id);
    receipts
        .iter()
        .filter(|r| {
            r.conflict
                && r.operation.branch_id == operation.branch_id
                && distances.contains_key(&r.operation.revision.id)
                && state.branches.iter().any(|b| {
                    b.id == r.result_branch_id
                        && !b.archived
                        && !state.deleted_branches.contains(&b.id)
                        && revision(state, b.head_revision_id)
                            .ok()
                            .is_some_and(|head| {
                                head.parents
                                    .first()
                                    .is_some_and(|parent| distances.contains_key(parent))
                            })
                })
        })
        .min_by_key(|r| (distances[&r.operation.revision.id], r.result_branch_id))
        .map(|r| r.result_branch_id)
}
fn conflict_revision(
    operation: &SyncOperation,
    branch_id: Uuid,
    previous: Option<Uuid>,
) -> Revision {
    let mut parents = vec![operation.revision.id];
    if let Some(previous) = previous {
        parents.push(previous);
    }
    Revision {
        id: stable_id(
            "conflict-revision",
            &[operation.operation_id.as_bytes(), branch_id.as_bytes()],
        ),
        note_id: operation.note_id,
        branch_id,
        title: operation.revision.title.clone(),
        body: operation.revision.body.clone(),
        parents,
        kind: RevisionKind::Conflict,
        // Preserve the originating revision's timestamp so retries and
        // replicas produce the same conflict history.
        created_at: operation.revision.created_at,
    }
}
fn stable_id(domain: &str, parts: &[&[u8]]) -> Uuid {
    let mut hash = Sha256::new();
    hash.update(domain.as_bytes());
    for part in parts {
        hash.update((part.len() as u64).to_be_bytes());
        hash.update(part);
    }
    let digest = hash.finalize();
    let mut bytes = [0; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x80;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes)
}
fn revision(state: &LibrarySnapshot, id: Uuid) -> Result<&Revision> {
    state
        .revisions
        .iter()
        .find(|r| r.id == id)
        .context("Missing revision ancestry")
}
fn insert_revision(state: &mut LibrarySnapshot, incoming: Revision) -> Result<()> {
    if let Some(existing) = state.revisions.iter().find(|r| r.id == incoming.id) {
        ensure!(
            *existing == incoming,
            "Revision ID has different immutable content"
        );
    } else {
        state.revisions.push(incoming);
    }
    Ok(())
}
fn ancestors(state: &LibrarySnapshot, head: Uuid) -> BTreeMap<Uuid, usize> {
    let revisions: BTreeMap<_, _> = state.revisions.iter().map(|r| (r.id, r)).collect();
    let mut distances = BTreeMap::new();
    let mut queue = VecDeque::from([(head, 0)]);
    while let Some((id, distance)) = queue.pop_front() {
        if distances.contains_key(&id) {
            continue;
        }
        distances.insert(id, distance);
        if let Some(revision) = revisions.get(&id) {
            for parent in &revision.parents {
                queue.push_back((*parent, distance + 1));
            }
        }
    }
    distances
}
pub fn is_ancestor(state: &LibrarySnapshot, ancestor: Uuid, head: Uuid) -> bool {
    ancestors(state, head).contains_key(&ancestor)
}
pub fn common_ancestor(state: &LibrarySnapshot, left: Uuid, right: Uuid) -> Option<Uuid> {
    let left = ancestors(state, left);
    let right = ancestors(state, right);
    left.iter()
        .filter_map(|(id, distance)| {
            right
                .get(id)
                .map(|other| ((*distance).max(*other), *distance + *other, *id))
        })
        .min()
        .map(|(_, _, id)| id)
}
fn merge_scalar(base: &str, left: &str, right: &str) -> Option<String> {
    if left == right || right == base {
        Some(left.into())
    } else if left == base {
        Some(right.into())
    } else {
        None
    }
}

#[derive(Clone, PartialEq, Eq)]
struct Hunk<'a> {
    start: usize,
    end: usize,
    replacement: Vec<&'a str>,
}

/// Bounded line LCS. Large ambiguous edits become conflicts rather than consuming unbounded memory.
fn hunks<'a>(base: &[&str], changed: &[&'a str]) -> Option<Vec<Hunk<'a>>> {
    let width = changed.len().checked_add(1)?;
    let cells = base.len().checked_add(1)?.checked_mul(width)?;
    if cells > 4_000_000 {
        return None;
    }
    let mut lcs = vec![0u32; cells];
    for i in (0..base.len()).rev() {
        for j in (0..changed.len()).rev() {
            lcs[i * width + j] = if base[i] == changed[j] {
                1 + lcs[(i + 1) * width + j + 1]
            } else {
                lcs[(i + 1) * width + j].max(lcs[i * width + j + 1])
            };
        }
    }
    let (mut i, mut j) = (0, 0);
    let mut result = Vec::new();
    while i < base.len() || j < changed.len() {
        if i < base.len() && j < changed.len() && base[i] == changed[j] {
            i += 1;
            j += 1;
            continue;
        }
        let start = i;
        let mut replacement = Vec::new();
        while i < base.len() || j < changed.len() {
            if i < base.len() && j < changed.len() && base[i] == changed[j] {
                break;
            }
            if j < changed.len()
                && (i == base.len() || lcs[i * width + j + 1] > lcs[(i + 1) * width + j])
            {
                replacement.push(changed[j]);
                j += 1;
            } else {
                i += 1;
            }
        }
        result.push(Hunk {
            start,
            end: i,
            replacement,
        });
    }
    Some(result)
}

pub fn merge_body(base: &str, left: &str, right: &str) -> Option<String> {
    if let Some(result) = merge_scalar(base, left, right) {
        return Some(result);
    }
    let base: Vec<_> = base.split_inclusive('\n').collect();
    let left: Vec<_> = left.split_inclusive('\n').collect();
    let right: Vec<_> = right.split_inclusive('\n').collect();
    let mut edits = hunks(&base, &left)?;
    for candidate in hunks(&base, &right)? {
        if edits.contains(&candidate) {
            continue;
        }
        for edit in &edits {
            let overlap = if edit.start == edit.end || candidate.start == candidate.end {
                edit.start <= candidate.end && candidate.start <= edit.end
            } else {
                edit.start < candidate.end && candidate.start < edit.end
            };
            if overlap {
                return None;
            }
        }
        edits.push(candidate);
    }
    edits.sort_by_key(|h| (h.start, h.end));
    let mut result = String::new();
    let mut cursor = 0;
    for edit in edits {
        for line in &base[cursor..edit.start] {
            result.push_str(line);
        }
        for line in edit.replacement {
            result.push_str(line);
        }
        cursor = edit.end;
    }
    for line in &base[cursor..] {
        result.push_str(line);
    }
    Some(result)
}

/// Local callers must flush editor changes before acquiring exclusive library access.
pub async fn sync_now(library: &mut Library, config: &SyncConfig) -> Result<SyncReport> {
    ensure!(!config.token.is_empty(), "A sync token is required");
    let url = reqwest::Url::parse(&config.server_url).context("Invalid sync server URL")?;
    ensure!(
        url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none(),
        "Credentials and query parameters do not belong in the server URL"
    );
    let loopback = matches!(
        url.host_str(),
        Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
    );
    ensure!(
        url.scheme() == "https" || (url.scheme() == "http" && loopback),
        "Remote sync requires HTTPS; HTTP is restricted to localhost"
    );
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let base = config.server_url.trim_end_matches('/');
    // Authenticate before binding or changing local state.
    let initial: PullResponse = response(
        client
            .post(format!("{base}/v1/sync/pull"))
            .bearer_auth(&config.token)
            .json(&PullRequest {
                library_id: config.library_id,
            })
            .send()
            .await?,
    )
    .await?;
    ensure!(
        initial.snapshot.library_id == config.library_id,
        "Server returned another library"
    );
    library.bind_library(config.library_id)?;
    let operations = library.pending_operations()?;
    let mut conflicts = BTreeSet::new();
    for operation in &operations {
        let pushed: PushResponse = response(
            client
                .post(format!("{base}/v1/sync/push"))
                .bearer_auth(&config.token)
                .json(&PushRequest {
                    operation: operation.clone(),
                })
                .send()
                .await?,
        )
        .await?;
        ensure!(
            pushed.receipt.operation == *operation,
            "Server acknowledged another operation"
        );
        if pushed.receipt.conflict {
            conflicts.insert(pushed.receipt.result_branch_id);
        }
    }
    let pulled: PullResponse = response(
        client
            .post(format!("{base}/v1/sync/pull"))
            .bearer_auth(&config.token)
            .json(&PullRequest {
                library_id: config.library_id,
            })
            .send()
            .await?,
    )
    .await?;
    library.accept_sync(
        &pulled.snapshot,
        &operations
            .iter()
            .map(|op| op.operation_id)
            .collect::<Vec<_>>(),
    )?;
    Ok(SyncReport {
        pushed: operations.len(),
        conflicts: pulled
            .snapshot
            .branches
            .iter()
            .filter(|b| conflicts.contains(&b.id))
            .cloned()
            .collect(),
        snapshot: pulled.snapshot,
    })
}

async fn response<T: serde::de::DeserializeOwned>(response: reqwest::Response) -> Result<T> {
    let status = response.status();
    // Do not echo response bodies, which may contain credentials from a misconfigured proxy.
    ensure!(
        status.is_success(),
        "Sync server returned HTTP {}",
        status.as_u16()
    );
    Ok(response.json().await?)
}

#[cfg(test)]
mod tests;
