//! SQLite-backed notes, immutable revision ancestry and a transactional sync outbox.
use anyhow::{ensure, Context, Result};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Note {
    pub id: Uuid,
    pub title: String,
    pub body: String,
    pub branch_id: Uuid,
    pub revision_id: Uuid,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Branch {
    pub id: Uuid,
    pub note_id: Uuid,
    pub name: String,
    pub head_revision_id: Uuid,
    pub archived: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum RevisionKind {
    Initial,
    Edit,
    Fork,
    Merge,
    Conflict,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Revision {
    pub id: Uuid,
    pub note_id: Uuid,
    pub branch_id: Uuid,
    pub title: String,
    pub body: String,
    pub parents: Vec<Uuid>,
    pub kind: RevisionKind,
    /// Unix epoch milliseconds. `None` preserves revisions written before timestamps existed.
    #[serde(default)]
    pub created_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum OperationAction {
    Save,
    Rename,
    Archive,
    Delete,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncOperation {
    pub library_id: Uuid,
    pub operation_id: Uuid,
    pub note_id: Uuid,
    pub branch_id: Uuid,
    pub base_revision: Option<Uuid>,
    pub expected_head: Option<Uuid>,
    pub revision: Revision,
    pub ancestry_branches: Vec<Branch>,
    pub ancestry_agent_branches: BTreeSet<Uuid>,
    pub branch: Branch,
    pub action: OperationAction,
    /// Complete input ancestry permits child-before-parent delivery.
    pub ancestry: Vec<Revision>,
    pub agent_branch: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OperationReceipt {
    pub operation: SyncOperation,
    pub result_branch_id: Uuid,
    pub conflict: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct LibrarySnapshot {
    pub version: u32,
    pub library_id: Uuid,
    pub branches: Vec<Branch>,
    pub revisions: Vec<Revision>,
    pub deleted_branches: BTreeSet<Uuid>,
    pub agent_branches: BTreeSet<Uuid>,
}

impl LibrarySnapshot {
    pub fn empty(library_id: Uuid) -> Self {
        Self {
            version: 1,
            library_id,
            branches: Vec::new(),
            revisions: Vec::new(),
            deleted_branches: BTreeSet::new(),
            agent_branches: BTreeSet::new(),
        }
    }

    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.version == 1,
            "Unsupported library version {}",
            self.version
        );
        let revisions: BTreeMap<_, _> = self.revisions.iter().map(|r| (r.id, r)).collect();
        let branches: BTreeMap<_, _> = self.branches.iter().map(|b| (b.id, b)).collect();
        ensure!(
            revisions.len() == self.revisions.len(),
            "Duplicate revision IDs"
        );
        ensure!(
            branches.len() == self.branches.len(),
            "Duplicate branch IDs"
        );
        for branch in &self.branches {
            ensure!(
                !branch.name.trim().is_empty(),
                "Branch name cannot be empty"
            );
            let head = revisions
                .get(&branch.head_revision_id)
                .context("Missing branch head")?;
            ensure!(
                head.note_id == branch.note_id && head.branch_id == branch.id,
                "Branch head belongs to another branch"
            );
        }
        for revision in &self.revisions {
            let branch = branches
                .get(&revision.branch_id)
                .context("Missing revision branch")?;
            ensure!(
                branch.note_id == revision.note_id,
                "Revision belongs to another note"
            );
            ensure!(revision.parents.len() <= 2, "Too many revision parents");
            let mut unique = BTreeSet::new();
            for parent in &revision.parents {
                ensure!(unique.insert(parent), "Duplicate revision parent");
                let ancestor = revisions.get(parent).context("Missing revision parent")?;
                ensure!(
                    ancestor.note_id == revision.note_id,
                    "Parent belongs to another note"
                );
            }
        }
        // Kahn's algorithm also rejects cycles without recursive stack growth.
        let mut degrees: BTreeMap<Uuid, usize> = self
            .revisions
            .iter()
            .map(|r| (r.id, r.parents.len()))
            .collect();
        let mut children: BTreeMap<Uuid, Vec<Uuid>> = BTreeMap::new();
        for r in &self.revisions {
            for p in &r.parents {
                children.entry(*p).or_default().push(r.id);
            }
        }
        let mut ready: Vec<Uuid> = degrees
            .iter()
            .filter_map(|(id, n)| (*n == 0).then_some(*id))
            .collect();
        let mut visited = 0;
        while let Some(id) = ready.pop() {
            visited += 1;
            for child in children.get(&id).into_iter().flatten() {
                let degree = degrees.get_mut(child).context("Missing child")?;
                *degree -= 1;
                if *degree == 0 {
                    ready.push(*child);
                }
            }
        }
        ensure!(
            visited == self.revisions.len(),
            "Revision ancestry contains a cycle"
        );
        for id in self.deleted_branches.iter().chain(&self.agent_branches) {
            ensure!(branches.contains_key(id), "Unknown branch flag");
        }
        Ok(())
    }
}

pub struct Library {
    connection: Connection,
}

impl Library {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let connection = Connection::open(path)?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, payload TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, agent INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TRIGGER IF NOT EXISTS immutable_revision_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT, 'immutable revision'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_revision_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT, 'immutable revision'); END;")?;
        connection.execute(
            "INSERT OR IGNORE INTO metadata(key,value) VALUES ('library_id',?1)",
            [Uuid::new_v4().to_string()],
        )?;
        Ok(Self { connection })
    }

    pub fn library_id(&self) -> Result<Uuid> {
        library_id(&self.connection)
    }

    /// Bind once to a remote library. Existing queued edits are retained.
    pub fn bind_library(&mut self, id: Uuid) -> Result<()> {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let bound: Option<String> = tx
            .query_row(
                "SELECT value FROM metadata WHERE key='remote_library_id'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(bound) = bound {
            ensure!(
                bound == id.to_string(),
                "Library is already bound to another server library"
            );
        }
        tx.execute("INSERT OR REPLACE INTO metadata(key,value) VALUES ('remote_library_id',?1),('library_id',?1)", [id.to_string()])?;
        for mut op in pending(&tx)? {
            op.library_id = id;
            tx.execute(
                "UPDATE outbox SET payload=?1 WHERE id=?2",
                params![serde_json::to_string(&op)?, op.operation_id.to_string()],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn create_note(&mut self, title: &str, body: &str) -> Result<Note> {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let revision = Revision {
            id: Uuid::new_v4(),
            note_id: Uuid::new_v4(),
            branch_id: Uuid::new_v4(),
            title: title.into(),
            body: body.into(),
            parents: vec![],
            kind: RevisionKind::Initial,
            created_at: Some(now_millis()),
        };
        let branch = Branch {
            id: revision.branch_id,
            note_id: revision.note_id,
            name: "Main".into(),
            head_revision_id: revision.id,
            archived: false,
        };
        insert_revision(&tx, &revision)?;
        put_branch(&tx, &branch, false, false)?;
        enqueue(&tx, &branch, &revision, None, OperationAction::Save)?;
        tx.commit()?;
        Ok(note(&branch, &revision))
    }

    pub fn get_note(&self, note_id: Uuid, branch_id: Uuid) -> Result<Note> {
        let branch = live_branch(&self.connection, branch_id)?;
        ensure!(branch.note_id == note_id, "Branch belongs to another note");
        Ok(note(
            &branch,
            &get_revision(&self.connection, branch.head_revision_id)?,
        ))
    }

    pub fn list_notes(&self, branch_id: Option<Uuid>) -> Result<Vec<Note>> {
        let branches = all_branches(&self.connection)?;
        let mut selected: BTreeMap<Uuid, (bool, Note)> = BTreeMap::new();
        for (branch, deleted, _) in branches {
            if deleted || branch.archived || branch_id.is_some_and(|id| id != branch.id) {
                continue;
            }
            let revision = get_revision(&self.connection, branch.head_revision_id)?;
            let main = history_from(&self.connection, revision.id)?
                .iter()
                .any(|r| r.kind == RevisionKind::Initial && r.branch_id == branch.id);
            if selected
                .get(&branch.note_id)
                .is_none_or(|(is_main, _)| main && !is_main)
            {
                selected.insert(branch.note_id, (main, note(&branch, &revision)));
            }
        }
        Ok(selected.into_values().map(|(_, note)| note).collect())
    }

    pub fn list_branches(&self, note_id: Uuid) -> Result<Vec<Branch>> {
        Ok(all_branches(&self.connection)?
            .into_iter()
            .filter_map(|(b, deleted, _)| (!deleted && b.note_id == note_id).then_some(b))
            .collect())
    }

    pub fn history(&self, note_id: Uuid, branch_id: Uuid) -> Result<Vec<Revision>> {
        let branch = live_branch(&self.connection, branch_id)?;
        ensure!(branch.note_id == note_id, "Branch belongs to another note");
        history_from(&self.connection, branch.head_revision_id)
    }

    pub fn save_note(
        &mut self,
        note_id: Uuid,
        branch_id: Uuid,
        title: &str,
        body: &str,
        expected_revision: Uuid,
    ) -> Result<Note> {
        self.save(note_id, branch_id, title, body, expected_revision, false)
    }

    pub fn agent_save(
        &mut self,
        note_id: Uuid,
        agent_branch: Uuid,
        title: &str,
        body: &str,
        expected_revision: Uuid,
    ) -> Result<Note> {
        self.save(note_id, agent_branch, title, body, expected_revision, true)
    }

    fn save(
        &mut self,
        note_id: Uuid,
        branch_id: Uuid,
        title: &str,
        body: &str,
        expected: Uuid,
        agent: bool,
    ) -> Result<Note> {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut branch = live_branch(&tx, branch_id)?;
        ensure!(branch.note_id == note_id, "Branch belongs to another note");
        ensure!(
            !branch.archived,
            "Restore the archived branch before editing"
        );
        if agent {
            ensure!(
                branch_flags(&tx, branch_id)?.1,
                "Agents may only write to an agent branch"
            );
        }
        let base = get_revision(&tx, expected)?;
        ensure!(
            history_from(&tx, branch.head_revision_id)?
                .iter()
                .any(|r| r.id == expected),
            "Expected revision is not in branch history"
        );
        if base.title == title && base.body == body {
            return Ok(note(&branch, &base));
        }
        let historical = branch.head_revision_id != expected;
        if agent {
            ensure!(
                !historical,
                "Agent branch head changed; reload before saving"
            );
        }
        if historical {
            branch = Branch {
                id: Uuid::new_v4(),
                note_id,
                name: format!("From history {}", &expected.to_string()[..8]),
                head_revision_id: expected,
                archived: false,
            };
        }
        let revision = Revision {
            id: Uuid::new_v4(),
            note_id,
            branch_id: branch.id,
            title: title.into(),
            body: body.into(),
            parents: vec![expected],
            kind: if historical {
                RevisionKind::Fork
            } else {
                RevisionKind::Edit
            },
            created_at: Some(now_millis()),
        };
        branch.head_revision_id = revision.id;
        insert_revision(&tx, &revision)?;
        let agent_flag = if historical {
            false
        } else {
            branch_flags(&tx, branch.id)?.1
        };
        put_branch(&tx, &branch, false, agent_flag)?;
        enqueue(
            &tx,
            &branch,
            &revision,
            if historical { None } else { Some(expected) },
            OperationAction::Save,
        )?;
        tx.commit()?;
        Ok(note(&branch, &revision))
    }

    pub fn create_branch(
        &mut self,
        note_id: Uuid,
        from_revision: Uuid,
        name: &str,
    ) -> Result<Branch> {
        self.fork(note_id, from_revision, name, false)
    }

    pub fn create_agent_branch(
        &mut self,
        note_id: Uuid,
        from_revision: Uuid,
        name: &str,
    ) -> Result<Branch> {
        self.fork(note_id, from_revision, name, true)
    }

    fn fork(&mut self, note_id: Uuid, from: Uuid, name: &str, agent: bool) -> Result<Branch> {
        ensure!(!name.trim().is_empty(), "Branch name cannot be empty");
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let base = get_revision(&tx, from)?;
        ensure!(base.note_id == note_id, "Revision belongs to another note");
        let revision = Revision {
            id: Uuid::new_v4(),
            note_id,
            branch_id: Uuid::new_v4(),
            title: base.title,
            body: base.body,
            parents: vec![from],
            kind: RevisionKind::Fork,
            created_at: Some(now_millis()),
        };
        let branch = Branch {
            id: revision.branch_id,
            note_id,
            name: name.trim().into(),
            head_revision_id: revision.id,
            archived: false,
        };
        insert_revision(&tx, &revision)?;
        put_branch(&tx, &branch, false, agent)?;
        enqueue(&tx, &branch, &revision, None, OperationAction::Save)?;
        tx.commit()?;
        Ok(branch)
    }

    pub fn rename_branch(&mut self, id: Uuid, name: &str) -> Result<Branch> {
        ensure!(!name.trim().is_empty(), "Branch name cannot be empty");
        self.change_branch(id, OperationAction::Rename, |branch| {
            branch.name = name.trim().into();
        })
    }

    pub fn archive_branch(&mut self, id: Uuid, archived: bool) -> Result<Branch> {
        self.change_branch(id, OperationAction::Archive, |branch| {
            branch.archived = archived;
        })
    }

    fn change_branch(
        &mut self,
        id: Uuid,
        action: OperationAction,
        change: impl FnOnce(&mut Branch),
    ) -> Result<Branch> {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut branch = live_branch(&tx, id)?;
        change(&mut branch);
        if branch.archived {
            ensure_other_live(&tx, &branch)?;
        }
        let revision = get_revision(&tx, branch.head_revision_id)?;
        let agent = branch_flags(&tx, id)?.1;
        put_branch(&tx, &branch, false, agent)?;
        enqueue(&tx, &branch, &revision, Some(revision.id), action)?;
        tx.commit()?;
        Ok(branch)
    }

    /// Deletion hides a branch but retains its head and every immutable revision.
    pub fn delete_branch(&mut self, id: Uuid) -> Result<()> {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let branch = live_branch(&tx, id)?;
        ensure!(branch.archived, "Archive a branch before deleting it");
        ensure_other_live(&tx, &branch)?;
        let revision = get_revision(&tx, branch.head_revision_id)?;
        let agent = branch_flags(&tx, id)?.1;
        put_branch(&tx, &branch, true, agent)?;
        enqueue(
            &tx,
            &branch,
            &revision,
            Some(revision.id),
            OperationAction::Delete,
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn snapshot(&self) -> Result<LibrarySnapshot> {
        snapshot(&self.connection)
    }
    pub fn pending_operations(&self) -> Result<Vec<SyncOperation>> {
        pending(&self.connection)
    }
    pub fn export_json(&self) -> Result<String> {
        Ok(serde_json::to_string_pretty(&self.snapshot()?)?)
    }

    /// Import is additive. Conflicting existing branch or revision IDs abort the transaction.
    pub fn import_json(&mut self, json: &str) -> Result<()> {
        let imported: LibrarySnapshot = serde_json::from_str(json)?;
        imported.validate()?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        for revision in &imported.revisions {
            insert_revision(&tx, revision)?;
        }
        let mut added = Vec::new();
        for branch in &imported.branches {
            let existing = optional_branch(&tx, branch.id)?;
            if let Some(existing) = &existing {
                ensure!(
                    existing == branch,
                    "Import would overwrite an existing branch"
                );
            }
            let deleted = imported.deleted_branches.contains(&branch.id);
            let agent = imported.agent_branches.contains(&branch.id);
            if existing.is_none() {
                put_branch(&tx, branch, deleted, agent)?;
                added.push((branch, deleted));
            } else {
                ensure!(
                    branch_flags(&tx, branch.id)? == (deleted, agent),
                    "Import would overwrite branch flags"
                );
            }
        }
        for (branch, deleted) in added {
            let revision = get_revision(&tx, branch.head_revision_id)?;
            enqueue(
                &tx,
                branch,
                &revision,
                if deleted { Some(revision.id) } else { None },
                if deleted {
                    OperationAction::Delete
                } else {
                    OperationAction::Save
                },
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Server reconciliation and its receipt commit in one SQLite transaction.
    pub fn sync_transaction<T>(
        &mut self,
        update: impl FnOnce(&mut LibrarySnapshot, &mut Vec<OperationReceipt>) -> Result<T>,
    ) -> Result<T> {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut state = snapshot(&tx)?;
        let mut receipts =
            read_payloads::<OperationReceipt>(&tx, "SELECT payload FROM receipts ORDER BY id")?;
        let result = update(&mut state, &mut receipts)?;
        state.validate()?;
        persist_snapshot(&tx, &state)?;
        for receipt in receipts {
            let existing: Option<String> = tx
                .query_row(
                    "SELECT payload FROM receipts WHERE id=?1",
                    [receipt.operation.operation_id.to_string()],
                    |r| r.get(0),
                )
                .optional()?;
            if let Some(existing) = existing {
                ensure!(
                    serde_json::from_str::<OperationReceipt>(&existing)? == receipt,
                    "Operation receipt is immutable"
                );
            } else {
                let payload = serde_json::to_string(&receipt)?;
                tx.execute(
                    "INSERT INTO receipts(id,payload) VALUES (?1,?2)",
                    params![receipt.operation.operation_id.to_string(), payload],
                )?;
            }
        }
        tx.commit()?;
        Ok(result)
    }

    /// The caller holds exclusive access while pushing, pulling and acknowledging this batch.
    pub fn accept_sync(&mut self, remote: &LibrarySnapshot, acknowledged: &[Uuid]) -> Result<()> {
        remote.validate()?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        ensure!(
            library_id(&tx)? == remote.library_id,
            "Remote library ID mismatch"
        );
        let outstanding = pending(&tx)?;
        ensure!(
            outstanding
                .iter()
                .all(|op| acknowledged.contains(&op.operation_id)),
            "Unsynchronised edits remain; retry sync before replacing heads"
        );
        let local = snapshot(&tx)?;
        for revision in &local.revisions {
            ensure!(
                remote.revisions.iter().any(|r| r == revision),
                "Remote snapshot omits a local revision"
            );
        }
        for branch in &local.branches {
            ensure!(
                remote.branches.iter().any(|b| b.id == branch.id),
                "Remote snapshot omits a local branch"
            );
        }
        persist_snapshot(&tx, remote)?;
        for id in acknowledged {
            tx.execute("DELETE FROM outbox WHERE id=?1", [id.to_string()])?;
        }
        tx.commit()?;
        Ok(())
    }
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

fn note(branch: &Branch, revision: &Revision) -> Note {
    Note {
        id: revision.note_id,
        title: revision.title.clone(),
        body: revision.body.clone(),
        branch_id: branch.id,
        revision_id: revision.id,
    }
}
fn library_id(conn: &Connection) -> Result<Uuid> {
    let id: String = conn.query_row(
        "SELECT value FROM metadata WHERE key='library_id'",
        [],
        |r| r.get(0),
    )?;
    Ok(Uuid::parse_str(&id)?)
}
fn get_revision(conn: &Connection, id: Uuid) -> Result<Revision> {
    let payload: String = conn
        .query_row(
            "SELECT payload FROM revisions WHERE id=?1",
            [id.to_string()],
            |r| r.get(0),
        )
        .with_context(|| format!("Revision {id} was not found"))?;
    Ok(serde_json::from_str(&payload)?)
}
fn insert_revision(conn: &Connection, revision: &Revision) -> Result<()> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT payload FROM revisions WHERE id=?1",
            [revision.id.to_string()],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(existing) = existing {
        ensure!(
            serde_json::from_str::<Revision>(&existing)? == *revision,
            "Revision ID has different immutable content"
        );
    } else {
        let payload = serde_json::to_string(revision)?;
        conn.execute(
            "INSERT INTO revisions(id,payload) VALUES (?1,?2)",
            params![revision.id.to_string(), payload],
        )?;
    }
    Ok(())
}
fn optional_branch(conn: &Connection, id: Uuid) -> Result<Option<Branch>> {
    let payload: Option<String> = conn
        .query_row(
            "SELECT payload FROM branches WHERE id=?1",
            [id.to_string()],
            |r| r.get(0),
        )
        .optional()?;
    payload
        .map(|p| serde_json::from_str(&p).map_err(Into::into))
        .transpose()
}
fn live_branch(conn: &Connection, id: Uuid) -> Result<Branch> {
    let branch = optional_branch(conn, id)?.context("Branch was not found")?;
    ensure!(
        !branch_flags(conn, id)?.0,
        "Branch was deleted; recover it by forking a retained revision"
    );
    Ok(branch)
}
fn branch_flags(conn: &Connection, id: Uuid) -> Result<(bool, bool)> {
    Ok(conn.query_row(
        "SELECT deleted,agent FROM branches WHERE id=?1",
        [id.to_string()],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?)
}
fn put_branch(conn: &Connection, branch: &Branch, deleted: bool, agent: bool) -> Result<()> {
    if let Some(existing) = optional_branch(conn, branch.id)? {
        ensure!(
            existing.note_id == branch.note_id,
            "Branch cannot change notes"
        );
    }
    conn.execute("INSERT INTO branches(id,payload,deleted,agent) VALUES (?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,deleted=excluded.deleted,agent=excluded.agent", params![branch.id.to_string(), serde_json::to_string(branch)?, deleted, agent])?;
    Ok(())
}
fn all_branches(conn: &Connection) -> Result<Vec<(Branch, bool, bool)>> {
    let mut stmt = conn.prepare("SELECT payload,deleted,agent FROM branches ORDER BY id")?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, bool>(1)?,
            r.get::<_, bool>(2)?,
        ))
    })?;
    rows.map(|row| {
        let (payload, deleted, agent) = row?;
        Ok((serde_json::from_str(&payload)?, deleted, agent))
    })
    .collect()
}
fn read_payloads<T: serde::de::DeserializeOwned>(conn: &Connection, sql: &str) -> Result<Vec<T>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    rows.map(|r| Ok(serde_json::from_str(&r?)?)).collect()
}
fn history_from(conn: &Connection, head: Uuid) -> Result<Vec<Revision>> {
    let mut result = Vec::new();
    let mut pending = vec![head];
    let mut visited = BTreeSet::new();
    while let Some(id) = pending.pop() {
        if !visited.insert(id) {
            continue;
        }
        let revision = get_revision(conn, id)?;
        pending.extend(revision.parents.iter().rev());
        result.push(revision);
    }
    Ok(result)
}
fn ensure_other_live(conn: &Connection, branch: &Branch) -> Result<()> {
    ensure!(
        all_branches(conn)?
            .iter()
            .any(|(b, deleted, _)| b.note_id == branch.note_id
                && b.id != branch.id
                && !b.archived
                && !deleted),
        "Cannot archive or delete the last active branch"
    );
    Ok(())
}
fn enqueue(
    conn: &Connection,
    branch: &Branch,
    revision: &Revision,
    expected: Option<Uuid>,
    action: OperationAction,
) -> Result<()> {
    let ancestry = history_from(conn, revision.id)?;
    let mut ancestry_branches = BTreeMap::new();
    let mut ancestry_agent_branches = BTreeSet::new();
    for ancestor in &ancestry {
        if let std::collections::btree_map::Entry::Vacant(entry) =
            ancestry_branches.entry(ancestor.branch_id)
        {
            let mut ancestor_branch =
                optional_branch(conn, ancestor.branch_id)?.context("Missing ancestor branch")?;
            if branch_flags(conn, ancestor.branch_id)?.1 {
                ancestry_agent_branches.insert(ancestor.branch_id);
            }
            ancestor_branch.head_revision_id = ancestor.id;
            entry.insert(ancestor_branch);
        }
    }
    let operation = SyncOperation {
        library_id: library_id(conn)?,
        operation_id: Uuid::new_v4(),
        note_id: branch.note_id,
        branch_id: branch.id,
        base_revision: revision.parents.first().copied().or(expected),
        expected_head: expected,
        revision: revision.clone(),
        branch: branch.clone(),
        action,
        ancestry,
        ancestry_branches: ancestry_branches.into_values().collect(),
        ancestry_agent_branches,
        agent_branch: branch_flags(conn, branch.id)?.1,
    };
    conn.execute(
        "INSERT INTO outbox(id,payload) VALUES (?1,?2)",
        params![
            operation.operation_id.to_string(),
            serde_json::to_string(&operation)?
        ],
    )?;
    Ok(())
}
fn pending(conn: &Connection) -> Result<Vec<SyncOperation>> {
    read_payloads(conn, "SELECT payload FROM outbox ORDER BY sequence")
}
fn snapshot(conn: &Connection) -> Result<LibrarySnapshot> {
    let mut state = LibrarySnapshot::empty(library_id(conn)?);
    state.revisions = read_payloads(conn, "SELECT payload FROM revisions ORDER BY id")?;
    for (branch, deleted, agent) in all_branches(conn)? {
        if deleted {
            state.deleted_branches.insert(branch.id);
        }
        if agent {
            state.agent_branches.insert(branch.id);
        }
        state.branches.push(branch);
    }
    Ok(state)
}
fn persist_snapshot(conn: &Connection, state: &LibrarySnapshot) -> Result<()> {
    ensure!(
        library_id(conn)? == state.library_id,
        "Library ID cannot change during reconciliation"
    );
    for revision in &state.revisions {
        insert_revision(conn, revision)?;
    }
    for branch in &state.branches {
        put_branch(
            conn,
            branch,
            state.deleted_branches.contains(&branch.id),
            state.agent_branches.contains(&branch.id),
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
