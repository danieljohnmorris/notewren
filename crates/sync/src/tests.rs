use super::*;
use notewren_core::Note;

struct Database(std::path::PathBuf);
impl Database {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!("notewren-sync-{}.sqlite", Uuid::new_v4())))
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
struct Fixture {
    server: Library,
    a: Library,
    b: Library,
    note: Note,
    paths: [Database; 3],
}
impl Fixture {
    fn new(body: &str) -> Self {
        let paths = [Database::new(), Database::new(), Database::new()];
        let (mut server, mut a, mut b) = (paths[0].open(), paths[1].open(), paths[2].open());
        let id = server.library_id().unwrap();
        a.bind_library(id).unwrap();
        b.bind_library(id).unwrap();
        let note = a.create_note("Title", body).unwrap();
        let operation = a.pending_operations().unwrap().remove(0);
        apply_operation(&mut server, &operation).unwrap();
        let snapshot = server.snapshot().unwrap();
        a.accept_sync(&snapshot, &[operation.operation_id]).unwrap();
        b.accept_sync(&snapshot, &[]).unwrap();
        Self {
            server,
            a,
            b,
            note,
            paths,
        }
    }
    fn edit_a(&mut self, title: &str, body: &str) -> SyncOperation {
        self.a
            .save_note(
                self.note.id,
                self.note.branch_id,
                title,
                body,
                self.note.revision_id,
            )
            .unwrap();
        self.a.pending_operations().unwrap().pop().unwrap()
    }
    fn edit_b(&mut self, title: &str, body: &str) -> SyncOperation {
        self.b
            .save_note(
                self.note.id,
                self.note.branch_id,
                title,
                body,
                self.note.revision_id,
            )
            .unwrap();
        self.b.pending_operations().unwrap().pop().unwrap()
    }
    fn push_both(
        &mut self,
        a: &SyncOperation,
        b: &SyncOperation,
    ) -> (OperationReceipt, OperationReceipt) {
        (
            apply_operation(&mut self.server, a).unwrap(),
            apply_operation(&mut self.server, b).unwrap(),
        )
    }
}

#[test]
fn one_sided_edit_fast_forwards_and_all_clients_converge_after_restart() {
    let mut f = Fixture::new("base\n");
    let operation = f.edit_a("Changed", "offline\n");
    let receipt = apply_operation(&mut f.server, &operation).unwrap();
    assert!(!receipt.conflict);
    let snapshot = f.server.snapshot().unwrap();
    f.a.accept_sync(&snapshot, &[operation.operation_id])
        .unwrap();
    f.b.accept_sync(&snapshot, &[]).unwrap();
    assert_eq!(f.a.snapshot().unwrap(), f.b.snapshot().unwrap());
    let reopened = f.paths[2].open();
    assert_eq!(
        reopened.get_note(f.note.id, f.note.branch_id).unwrap().body,
        "offline\n"
    );
    assert_eq!(reopened.snapshot().unwrap(), snapshot);
}

#[test]
fn disjoint_edits_merge_with_both_parents_and_stable_merge_id_in_either_order() {
    let mut f = Fixture::new("one\ntwo\nthree\n");
    let original = f.server.snapshot().unwrap();
    let a = f.edit_a("Title", "ONE\ntwo\nthree\n");
    let b = f.edit_b("Title", "one\ntwo\nTHREE\n");
    let (_, receipt) = f.push_both(&a, &b);
    assert!(!receipt.conflict);
    let merged = f.server.get_note(f.note.id, f.note.branch_id).unwrap();
    assert_eq!(merged.body, "ONE\ntwo\nTHREE\n");
    let history = f.server.history(f.note.id, f.note.branch_id).unwrap();
    assert_eq!(history[0].kind, RevisionKind::Merge);
    assert_eq!(history[0].parents.len(), 2);
    assert!(history[0].parents.contains(&a.revision.id));
    assert!(history[0].parents.contains(&b.revision.id));
    assert!(history.iter().any(|r| r.id == f.note.revision_id));
    let mut reversed = original;
    let mut receipts = Vec::new();
    reconcile(&mut reversed, &mut receipts, &b).unwrap();
    reconcile(&mut reversed, &mut receipts, &a).unwrap();
    assert_eq!(reversed, f.server.snapshot().unwrap());
}

#[test]
fn identical_concurrent_content_preserves_both_input_revisions() {
    let mut f = Fixture::new("base");
    let a = f.edit_a("Same title", "same body");
    let b = f.edit_b("Same title", "same body");
    let (_, receipt) = f.push_both(&a, &b);
    assert!(!receipt.conflict);
    let history = f.server.history(f.note.id, f.note.branch_id).unwrap();
    assert_eq!(history[0].parents.len(), 2);
    assert_eq!(history[0].body, "same body");
    assert_eq!(f.server.list_branches(f.note.id).unwrap().len(), 1);
}

#[test]
fn title_conflict_keeps_complete_title_and_body_pairs_without_partial_merge() {
    let mut f = Fixture::new("one\ntwo\n");
    let a = f.edit_a("Title A", "ONE\ntwo\n");
    let b = f.edit_b("Title B", "one\nTWO\n");
    let (_, receipt) = f.push_both(&a, &b);
    assert!(receipt.conflict);
    let accepted = f.server.get_note(f.note.id, f.note.branch_id).unwrap();
    let preserved = f
        .server
        .get_note(f.note.id, receipt.result_branch_id)
        .unwrap();
    assert_eq!(
        (accepted.title.as_str(), accepted.body.as_str()),
        ("Title A", "ONE\ntwo\n")
    );
    assert_eq!(
        (preserved.title.as_str(), preserved.body.as_str()),
        ("Title B", "one\nTWO\n")
    );
    assert!(f
        .server
        .history(f.note.id, receipt.result_branch_id)
        .unwrap()
        .iter()
        .any(|r| r.id == b.revision.id));
}

#[test]
fn body_conflict_retry_is_durable_and_operation_id_reuse_is_rejected() {
    let mut f = Fixture::new("base");
    let a = f.edit_a("Title", "accepted");
    let b = f.edit_b("Title", "incoming");
    let (_, first) = f.push_both(&a, &b);
    assert!(first.conflict);
    let before = f.server.snapshot().unwrap();
    assert_eq!(apply_operation(&mut f.server, &b).unwrap(), first);
    let mut restarted = f.paths[0].open();
    assert_eq!(apply_operation(&mut restarted, &b).unwrap(), first);
    assert_eq!(restarted.snapshot().unwrap(), before);
    let mut reused = b.clone();
    reused.revision.body = "different payload".into();
    assert!(apply_operation(&mut restarted, &reused).is_err());
    assert_eq!(restarted.snapshot().unwrap(), before);
}

#[test]
fn explicit_branches_are_never_merged_into_each_other() {
    let mut f = Fixture::new("one\ntwo\n");
    let branch =
        f.b.create_branch(f.note.id, f.note.revision_id, "Deliberate alternative")
            .unwrap();
    f.b.save_note(
        f.note.id,
        branch.id,
        "Title",
        "one\nTWO\n",
        branch.head_revision_id,
    )
    .unwrap();
    let a = f.edit_a("Title", "ONE\ntwo\n");
    apply_operation(&mut f.server, &a).unwrap();
    for operation in f.b.pending_operations().unwrap() {
        assert!(!apply_operation(&mut f.server, &operation).unwrap().conflict);
    }
    assert_eq!(
        f.server.get_note(f.note.id, f.note.branch_id).unwrap().body,
        "ONE\ntwo\n"
    );
    assert_eq!(
        f.server.get_note(f.note.id, branch.id).unwrap().body,
        "one\nTWO\n"
    );
    assert_eq!(f.server.list_branches(f.note.id).unwrap().len(), 2);
}

#[test]
fn reordered_child_then_parent_keeps_latest_head_and_full_ancestry() {
    let mut f = Fixture::new("base");
    let first =
        f.a.save_note(
            f.note.id,
            f.note.branch_id,
            "Title",
            "first",
            f.note.revision_id,
        )
        .unwrap();
    let second =
        f.a.save_note(
            f.note.id,
            f.note.branch_id,
            "Title",
            "second",
            first.revision_id,
        )
        .unwrap();
    let operations = f.a.pending_operations().unwrap();
    apply_operation(&mut f.server, &operations[1]).unwrap();
    apply_operation(&mut f.server, &operations[0]).unwrap();
    assert_eq!(
        f.server.get_note(f.note.id, f.note.branch_id).unwrap(),
        second
    );
    assert_eq!(
        f.server.history(f.note.id, f.note.branch_id).unwrap().len(),
        3
    );
    assert_eq!(f.server.list_branches(f.note.id).unwrap().len(), 1);
}

#[test]
fn reordered_new_fork_before_its_origin_preserves_independent_branches() {
    let server_path = Database::new();
    let client_path = Database::new();
    let mut server = server_path.open();
    let mut client = client_path.open();
    client.bind_library(server.library_id().unwrap()).unwrap();
    let note = client.create_note("Title", "base").unwrap();
    let branch = client
        .create_branch(note.id, note.revision_id, "Alternative")
        .unwrap();
    let operations = client.pending_operations().unwrap();
    apply_operation(&mut server, &operations[1]).unwrap();
    apply_operation(&mut server, &operations[0]).unwrap();
    assert_eq!(server.list_branches(note.id).unwrap().len(), 2);
    assert_eq!(server.get_note(note.id, branch.id).unwrap().body, "base");
    assert_eq!(server.snapshot().unwrap(), client.snapshot().unwrap());
}

#[test]
fn queued_edits_continue_on_one_preserved_conflict_branch() {
    let mut f = Fixture::new("base");
    let a = f.edit_a("Title", "accepted");
    let b = f.edit_b("Title", "incoming first");
    f.b.save_note(
        f.note.id,
        f.note.branch_id,
        "Title",
        "incoming latest",
        b.revision.id,
    )
    .unwrap();
    let later = f.b.pending_operations().unwrap().pop().unwrap();
    let (_, first) = f.push_both(&a, &b);
    let next = apply_operation(&mut f.server, &later).unwrap();
    assert_eq!(first.result_branch_id, next.result_branch_id);
    assert_eq!(f.server.list_branches(f.note.id).unwrap().len(), 2);
    assert_eq!(
        f.server
            .get_note(f.note.id, next.result_branch_id)
            .unwrap()
            .body,
        "incoming latest"
    );
    assert_eq!(
        f.server.get_note(f.note.id, f.note.branch_id).unwrap().body,
        "accepted"
    );
}

#[test]
fn reordered_conflicting_descendant_does_not_duplicate_conflict_on_ancestor_delivery() {
    let mut f = Fixture::new("base");
    let a = f.edit_a("Title", "accepted");
    let b = f.edit_b("Title", "incoming first");
    f.b.save_note(
        f.note.id,
        f.note.branch_id,
        "Title",
        "incoming latest",
        b.revision.id,
    )
    .unwrap();
    let later = f.b.pending_operations().unwrap().pop().unwrap();
    apply_operation(&mut f.server, &a).unwrap();
    let last = apply_operation(&mut f.server, &later).unwrap();
    let first = apply_operation(&mut f.server, &b).unwrap();
    assert_eq!(last.result_branch_id, first.result_branch_id);
    assert_eq!(f.server.list_branches(f.note.id).unwrap().len(), 2);
    assert_eq!(
        f.server
            .get_note(f.note.id, last.result_branch_id)
            .unwrap()
            .body,
        "incoming latest"
    );
}

#[test]
fn deletion_and_concurrent_edit_preserve_edit_in_both_delivery_orders() {
    for deletion_first in [false, true] {
        let mut f = Fixture::new("base");
        let branch =
            f.a.create_branch(f.note.id, f.note.revision_id, "Disposable")
                .unwrap();
        let create = f.a.pending_operations().unwrap().pop().unwrap();
        apply_operation(&mut f.server, &create).unwrap();
        let snapshot = f.server.snapshot().unwrap();
        f.a.accept_sync(&snapshot, &[create.operation_id]).unwrap();
        f.b.accept_sync(&snapshot, &[]).unwrap();
        f.a.archive_branch(branch.id, true).unwrap();
        f.a.delete_branch(branch.id).unwrap();
        f.b.save_note(
            f.note.id,
            branch.id,
            "Recovered",
            "concurrent text",
            branch.head_revision_id,
        )
        .unwrap();
        let deletion = f.a.pending_operations().unwrap();
        let edit = f.b.pending_operations().unwrap().pop().unwrap();
        if deletion_first {
            for op in &deletion {
                apply_operation(&mut f.server, op).unwrap();
            }
            let receipt = apply_operation(&mut f.server, &edit).unwrap();
            assert!(receipt.conflict);
            assert_eq!(
                f.server
                    .get_note(f.note.id, receipt.result_branch_id)
                    .unwrap()
                    .body,
                "concurrent text"
            );
        } else {
            apply_operation(&mut f.server, &edit).unwrap();
            for op in &deletion {
                apply_operation(&mut f.server, op).unwrap();
            }
            assert_eq!(
                f.server.get_note(f.note.id, branch.id).unwrap().body,
                "concurrent text"
            );
        }
        assert!(f
            .server
            .snapshot()
            .unwrap()
            .revisions
            .iter()
            .any(|r| r.id == edit.revision.id));
    }
}

#[test]
fn malformed_ancestry_and_wrong_library_roll_back_without_receipt() {
    let mut f = Fixture::new("base");
    let mut operation = f.edit_a("Title", "valid edit");
    let before = f.server.snapshot().unwrap();
    let valid = operation.clone();
    operation.revision.parents = vec![Uuid::new_v4()];
    operation.base_revision = operation.revision.parents.first().copied();
    operation.expected_head = operation.base_revision;
    assert!(apply_operation(&mut f.server, &operation).is_err());
    assert_eq!(f.server.snapshot().unwrap(), before);
    operation = valid.clone();
    operation.library_id = Uuid::new_v4();
    assert!(apply_operation(&mut f.server, &operation).is_err());
    assert_eq!(f.server.snapshot().unwrap(), before);
    apply_operation(&mut f.server, &valid).unwrap();
}

#[test]
fn line_merge_handles_insertions_deletions_endings_and_conservative_overlap() {
    assert_eq!(
        merge_body("a\nb\nc\n", "a\nc\n", "a\nb\nC\n"),
        Some("a\nC\n".into())
    );
    assert_eq!(
        merge_body("a\nb\n", "x\na\nb\n", "a\nb\ny\n"),
        Some("x\na\nb\ny\n".into())
    );
    assert_eq!(merge_body("a\nb", "A\nb", "a\nB"), Some("A\nB".into()));
    assert_eq!(merge_body("a\n", "x\na\n", "y\na\n"), None);
    assert_eq!(merge_body("a\nb\n", "A\nb\n", "OTHER\nb\n"), None);
    assert_eq!(merge_body("", "same", "same"), Some("same".into()));
    assert_eq!(merge_body("", "left", "right"), None);
}

#[tokio::test]
async fn unsafe_server_urls_are_rejected_before_network_or_local_mutation() {
    let db = Database::new();
    let mut library = db.open();
    let id = library.library_id().unwrap();
    let before = library.export_json().unwrap();
    for url in [
        "http://example.com",
        "https://user:secret@example.com",
        "https://example.com?token=secret",
        "file:///tmp/server",
    ] {
        let config = SyncConfig {
            server_url: url.into(),
            library_id: id,
            token: "test-token".into(),
        };
        assert!(sync_now(&mut library, &config).await.is_err());
        assert_eq!(library.export_json().unwrap(), before);
    }
}

#[test]
fn agent_branch_identity_survives_reordered_fork_delivery() {
    let mut f = Fixture::new("writer text");
    let agent =
        f.a.create_agent_branch(f.note.id, f.note.revision_id, "Agent draft")
            .unwrap();
    let fork =
        f.a.create_branch(f.note.id, agent.head_revision_id, "Writer alternative")
            .unwrap();
    let operations = f.a.pending_operations().unwrap();
    apply_operation(&mut f.server, &operations[1]).unwrap();
    apply_operation(&mut f.server, &operations[0]).unwrap();
    assert!(f
        .server
        .snapshot()
        .unwrap()
        .agent_branches
        .contains(&agent.id));
    assert!(!f
        .server
        .snapshot()
        .unwrap()
        .agent_branches
        .contains(&fork.id));
    assert_eq!(
        f.server.get_note(f.note.id, f.note.branch_id).unwrap(),
        f.note
    );
}

#[test]
fn divergent_edits_after_a_conflict_do_not_overwrite_the_preserved_head() {
    let mut f = Fixture::new("base");
    let a = f.edit_a("Title", "accepted");
    let b = f.edit_b("Title", "incoming first");
    let (_, first) = f.push_both(&a, &b);
    f.b.save_note(
        f.note.id,
        f.note.branch_id,
        "Title",
        "incoming second",
        b.revision.id,
    )
    .unwrap();
    let second = f.b.pending_operations().unwrap().pop().unwrap();
    apply_operation(&mut f.server, &second).unwrap();
    let mut divergent = second.clone();
    divergent.operation_id = Uuid::new_v4();
    divergent.revision.id = Uuid::new_v4();
    divergent.revision.body = "another concurrent draft".into();
    divergent.branch.head_revision_id = divergent.revision.id;
    divergent.ancestry.retain(|r| r.id != second.revision.id);
    divergent.ancestry.push(divergent.revision.clone());
    for branch in &mut divergent.ancestry_branches {
        if branch.id == divergent.branch_id {
            branch.head_revision_id = divergent.revision.id;
        }
    }
    let receipt = apply_operation(&mut f.server, &divergent).unwrap();
    assert_ne!(receipt.result_branch_id, first.result_branch_id);
    assert_eq!(
        f.server
            .get_note(f.note.id, first.result_branch_id)
            .unwrap()
            .body,
        "incoming second"
    );
    assert_eq!(
        f.server
            .get_note(f.note.id, receipt.result_branch_id)
            .unwrap()
            .body,
        "another concurrent draft"
    );
}
