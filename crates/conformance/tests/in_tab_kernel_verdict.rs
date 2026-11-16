//! The `in-tab-kernel-verdict` suite: one test per scenario in `features/suites/in-tab-kernel-verdict.feature`.
use std::path::PathBuf;
use std::process::Command;

/// `FA-86`: A proof verdict is decided by the Prism guest from addresses the tab derived and the result of a kernel run in the tab, never from a server reply
#[test]
fn in_tab_kernel_verdict_fa_86() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    let output = Command::new("node")
        .args(["--test", "--test-reporter=tap"])
        .arg(root.join("studio/tools/in_tab_kernel_verdict.test.mjs"))
        .output()
        .expect("the locked SDK supplies Node");
    let report = String::from_utf8_lossy(&output.stdout);
    assert!(
        output.status.success(),
        "{report}\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
    // A run that skipped, filtered or lost a test is not the oracle.
    for required in [
        "# tests 7",
        "# pass 7",
        "# fail 0",
        "# cancelled 0",
        "# skipped 0",
        "# todo 0",
    ] {
        assert!(
            report.lines().any(|line| line == required),
            "incomplete oracle: {report}"
        );
    }
}

/// `FA-90`: A published app's answer is decided by the rule judge in Foundry's Prism kernel: the first rule whose conditions all hold decides, otherwise decides when none does, and a request outside the fields' bounds is refused
#[test]
fn rule_judge_fa_90() {
    // Lean proves every ruleWords theorem by evaluation (`just app`), and the kernel gate replays each
    // as an acceptance vector in the compiled guest; this holds the two to each other and to dispatch.
    let judge = include_str!("../../../app/src/RuleJudge.lex.tex");
    let kernel = include_str!("../../../app/src/ForgeKernel.lex.tex");
    assert!(
        kernel.contains("(RuleJudge::dispatchRule (sliceOf value 5")
            && kernel.contains("(ruleAcceptance))")
    );
    let theorems = judge.matches("name: ruleWords_").count();
    let vectors = kernel.matches("request := 0x72756c6520").count();
    assert_eq!(theorems, vectors);
    assert!(theorems >= 9);
}

/// `FA-91`: A private workspace opens only for the Prism id that owns it, on a device with a live session and its current boundary key; a record is read only when authentic and in place and stored only sealed; the workspace kept before an id moves in once; and Foundry's Prism kernel names every refusal
#[test]
fn private_workspace_fa_91() {
    // Lean proves every workspaceWords theorem by evaluation (`just app`) and the kernel gate replays
    // each as an acceptance vector in the compiled guest; this holds the two to each other and to dispatch.
    let workspace = include_str!("../../../app/src/WorkspaceProofs.lex.tex");
    let kernel = include_str!("../../../app/src/ForgeKernel.lex.tex");
    assert!(kernel.contains("(Workspace::dispatchWorkspace (sliceOf value 10"));
    let theorems = workspace.matches("name: workspaceWords_").count();
    assert_eq!(
        theorems,
        kernel.matches("request := 0x776f726b737061636520").count()
    );
    assert!(theorems >= 19 && kernel.contains("(workspaceAcceptance))))"));
}
