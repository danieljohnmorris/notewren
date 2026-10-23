use super::*;

struct Database(std::path::PathBuf);
impl Database {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!("notewren-core-{}.sqlite", Uuid::new_v4())))
    }
    fn open(&self) -> Library {
        Library::open(&self.0).unwrap()
    }
}
impl Drop for Database {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
        let _ = std::fs::remove_file(format!("{}-wal", self.0.display()));
        let _ = std::fs::remove_file(format!("{}-shm", self.0.display()));
    }
}

#[test]
fn persists_revisions_heads_and_outbox_after_reopening() {
    let db = Database::new();
    let mut library = db.open();
    let initial = library.create_note("Title", "first").unwrap();
    let saved = library
        .save_note(
            initial.id,
            initial.branch_id,
            "Changed",
            "second",
            initial.revision_id,
        )
        .unwrap();
    assert_eq!(initial.branch_id, saved.branch_id);
    let operations = library.pending_operations().unwrap();
    assert_eq!(operations.len(), 2);
    drop(library);
    let reopened = db.open();
    assert_eq!(reopened.get_note(saved.id, saved.branch_id).unwrap(), saved);
    assert_eq!(
        reopened.history(saved.id, saved.branch_id).unwrap().len(),
        2
    );
    assert_eq!(reopened.pending_operations().unwrap(), operations);
    assert_eq!(reopened.list_branches(saved.id).unwrap().len(), 1);
}

#[test]
fn history_inspection_and_unchanged_save_do_not_fork_first_edit_does() {
    let db = Database::new();
    let mut library = db.open();
    let initial = library.create_note("Title", "past").unwrap();
    let newest = library
        .save_note(
            initial.id,
            initial.branch_id,
            "Title",
            "present",
            initial.revision_id,
        )
        .unwrap();
    library.history(initial.id, initial.branch_id).unwrap();
    library
        .save_note(
            initial.id,
            initial.branch_id,
            "Title",
            "past",
            initial.revision_id,
        )
        .unwrap();
    assert_eq!(library.list_branches(initial.id).unwrap().len(), 1);
    let fork = library
        .save_note(
            initial.id,
            initial.branch_id,
            "Title",
            "alternative",
            initial.revision_id,
        )
        .unwrap();
    assert_ne!(fork.branch_id, initial.branch_id);
    assert_eq!(
        library.get_note(initial.id, initial.branch_id).unwrap(),
        newest
    );
    let next = library
        .save_note(
            fork.id,
            fork.branch_id,
            "Title",
            "alternative continued",
            fork.revision_id,
        )
        .unwrap();
    assert_eq!(next.branch_id, fork.branch_id);
    assert_eq!(library.list_branches(initial.id).unwrap().len(), 2);
    let history = library.history(next.id, next.branch_id).unwrap();
    assert_eq!(history[1].kind, RevisionKind::Fork);
    assert_eq!(history[1].parents, vec![initial.revision_id]);
}

#[test]
fn agent_writes_are_isolated_and_stale_agent_writes_are_rejected() {
    let db = Database::new();
    let mut library = db.open();
    let user = library.create_note("Mine", "writer's words").unwrap();
    assert!(library
        .agent_save(
            user.id,
            user.branch_id,
            "Agent",
            "overwrite",
            user.revision_id
        )
        .is_err());
    let agent = library
        .create_agent_branch(user.id, user.revision_id, "Proofreader")
        .unwrap();
    let saved = library
        .agent_save(
            user.id,
            agent.id,
            "Mine",
            "suggested words",
            agent.head_revision_id,
        )
        .unwrap();
    assert_eq!(library.get_note(user.id, user.branch_id).unwrap(), user);
    assert_eq!(library.get_note(user.id, agent.id).unwrap(), saved);
    assert!(library
        .agent_save(
            user.id,
            agent.id,
            "Mine",
            "stale words",
            agent.head_revision_id
        )
        .is_err());
    assert_eq!(library.list_branches(user.id).unwrap().len(), 2);
}

#[test]
fn outbox_failure_rolls_back_revision_and_head_together() {
    let db = Database::new();
    let mut library = db.open();
    let initial = library.create_note("Title", "durable").unwrap();
    let before = library.export_json().unwrap();
    let outbox = library.pending_operations().unwrap();
    library.connection.execute_batch("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'injected outbox failure'); END;").unwrap();
    assert!(library
        .save_note(
            initial.id,
            initial.branch_id,
            "Title",
            "unsaved",
            initial.revision_id
        )
        .is_err());
    assert_eq!(library.export_json().unwrap(), before);
    assert_eq!(library.pending_operations().unwrap(), outbox);
    assert!(library.create_note("Failed creation", "body").is_err());
    assert_eq!(library.export_json().unwrap(), before);
    library
        .connection
        .execute_batch("DROP TRIGGER fail_outbox;")
        .unwrap();
    library
        .save_note(
            initial.id,
            initial.branch_id,
            "Title",
            "saved",
            initial.revision_id,
        )
        .unwrap();
    assert_eq!(
        library.pending_operations().unwrap().len(),
        outbox.len() + 1
    );
}

#[test]
fn revisions_cannot_be_updated_or_deleted_through_sql() {
    let db = Database::new();
    let mut library = db.open();
    library.create_note("Title", "body").unwrap();
    assert!(library
        .connection
        .execute("UPDATE revisions SET payload='{}'", [])
        .is_err());
    assert!(library
        .connection
        .execute("DELETE FROM revisions", [])
        .is_err());
}

#[test]
fn export_import_preserves_ancestry_and_rejects_overwrite_atomically() {
    let first = Database::new();
    let second = Database::new();
    let mut source = first.open();
    let mut destination = second.open();
    let note = source.create_note("Title", "original").unwrap();
    let branch = source
        .create_branch(note.id, note.revision_id, "Alternative")
        .unwrap();
    source
        .save_note(
            note.id,
            branch.id,
            "Alternative",
            "different",
            branch.head_revision_id,
        )
        .unwrap();
    let json = source.export_json().unwrap();
    destination.import_json(&json).unwrap();
    let imported = destination.snapshot().unwrap();
    assert_eq!(imported.branches, source.snapshot().unwrap().branches);
    assert_eq!(imported.revisions, source.snapshot().unwrap().revisions);
    destination.import_json(&json).unwrap();
    assert_eq!(destination.pending_operations().unwrap().len(), 2);
    let before = destination.export_json().unwrap();
    let mut invalid = source.snapshot().unwrap();
    invalid.revisions[0].body = "rewrite immutable history".into();
    assert!(destination
        .import_json(&serde_json::to_string(&invalid).unwrap())
        .is_err());
    assert_eq!(destination.export_json().unwrap(), before);
    invalid = source.snapshot().unwrap();
    invalid.revisions[0].parents = vec![Uuid::new_v4()];
    assert!(destination
        .import_json(&serde_json::to_string(&invalid).unwrap())
        .is_err());
    assert_eq!(destination.export_json().unwrap(), before);
}

#[test]
fn deletion_protects_last_branch_and_keeps_recovery_ancestry() {
    let db = Database::new();
    let mut library = db.open();
    let initial = library.create_note("Title", "body").unwrap();
    assert!(library.archive_branch(initial.branch_id, true).is_err());
    assert!(library.delete_branch(initial.branch_id).is_err());
    let alternative = library
        .create_branch(initial.id, initial.revision_id, "Alternative")
        .unwrap();
    assert!(library.delete_branch(alternative.id).is_err());
    library.archive_branch(alternative.id, true).unwrap();
    library.delete_branch(alternative.id).unwrap();
    assert!(library.get_note(initial.id, alternative.id).is_err());
    let recovered = library
        .create_branch(initial.id, alternative.head_revision_id, "Recovered")
        .unwrap();
    assert_eq!(
        library.get_note(initial.id, recovered.id).unwrap().body,
        "body"
    );
    assert_eq!(library.history(initial.id, recovered.id).unwrap().len(), 3);
}

#[test]
fn invalid_sync_state_and_unacknowledged_edits_leave_database_unchanged() {
    let db = Database::new();
    let mut library = db.open();
    library.create_note("Title", "local").unwrap();
    let before = library.export_json().unwrap();
    assert!(library
        .sync_transaction(|state, _| {
            state.branches[0].head_revision_id = Uuid::new_v4();
            Ok(())
        })
        .is_err());
    assert_eq!(library.export_json().unwrap(), before);
    let remote = library.snapshot().unwrap();
    assert!(library.accept_sync(&remote, &[]).is_err());
    assert_eq!(library.export_json().unwrap(), before);
    let acknowledged: Vec<_> = library
        .pending_operations()
        .unwrap()
        .iter()
        .map(|o| o.operation_id)
        .collect();
    library.accept_sync(&remote, &acknowledged).unwrap();
    assert!(library.pending_operations().unwrap().is_empty());
}

#[test]
fn cross_note_references_and_cyclic_imports_are_rejected() {
    let db = Database::new();
    let mut library = db.open();
    let first = library.create_note("First", "one").unwrap();
    let second = library.create_note("Second", "two").unwrap();
    assert!(library
        .create_branch(first.id, second.revision_id, "Wrong note")
        .is_err());
    assert!(library
        .save_note(
            first.id,
            first.branch_id,
            "First",
            "changed",
            second.revision_id
        )
        .is_err());
    let mut state = library.snapshot().unwrap();
    let first = state
        .revisions
        .iter_mut()
        .find(|r| r.id == first.revision_id)
        .unwrap();
    first.parents.push(first.id);
    assert!(state.validate().is_err());
}

#[test]
fn receipt_write_failure_rolls_back_reconciled_heads() {
    let db = Database::new();
    let mut library = db.open();
    library.create_note("Title", "durable").unwrap();
    let operation = library.pending_operations().unwrap().remove(0);
    let before = library.export_json().unwrap();
    library.connection.execute_batch("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;").unwrap();
    assert!(library
        .sync_transaction(|state, receipts| {
            state.branches[0].name = "Must roll back".into();
            receipts.push(OperationReceipt {
                result_branch_id: operation.branch_id,
                operation,
                conflict: false,
            });
            Ok(())
        })
        .is_err());
    assert_eq!(library.export_json().unwrap(), before);
    let count: i64 = library
        .connection
        .query_row("SELECT count(*) FROM receipts", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn legacy_timestamp_omission_survives_sync_without_weakening_immutability() {
    let db = Database::new();
    let mut library = db.open();
    let note = library.create_note("Legacy", "Keep this text").unwrap();
    let operation = library.pending_operations().unwrap().remove(0);
    let mut revision = serde_json::to_value(&operation.revision).unwrap();
    revision.as_object_mut().unwrap().remove("created_at");
    library
        .connection
        .execute_batch("DROP TRIGGER immutable_revision_update;")
        .unwrap();
    library
        .connection
        .execute(
            "UPDATE revisions SET payload=?1 WHERE id=?2",
            params![revision.to_string(), note.revision_id.to_string()],
        )
        .unwrap();
    let mut receipt = serde_json::to_value(OperationReceipt {
        result_branch_id: operation.branch_id,
        operation,
        conflict: false,
    })
    .unwrap();
    receipt["operation"]["revision"]
        .as_object_mut()
        .unwrap()
        .remove("created_at");
    for ancestor in receipt["operation"]["ancestry"].as_array_mut().unwrap() {
        ancestor.as_object_mut().unwrap().remove("created_at");
    }
    let operation_id = receipt["operation"]["operation_id"].as_str().unwrap();
    library
        .connection
        .execute(
            "INSERT INTO receipts(id,payload) VALUES (?1,?2)",
            params![operation_id, receipt.to_string()],
        )
        .unwrap();
    drop(library);
    let mut library = db.open();
    library.sync_transaction(|_, _| Ok(())).unwrap();
    assert_eq!(library.get_note(note.id, note.branch_id).unwrap(), note);
    assert!(library
        .sync_transaction(|state, _| {
            state.revisions[0].body = "Replaced".into();
            Ok(())
        })
        .is_err());
    assert!(library
        .sync_transaction(|_, receipts| {
            receipts[0].operation.revision.body = "Replaced".into();
            Ok(())
        })
        .is_err());
    assert_eq!(library.get_note(note.id, note.branch_id).unwrap(), note);
}
