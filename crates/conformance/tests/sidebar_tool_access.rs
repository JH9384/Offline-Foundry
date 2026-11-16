//! Execute the canonical module boundary and its negative controls.
use std::path::PathBuf;
use std::process::Command;

#[test]
fn sidebar_tool_access_fa_68() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    let output = Command::new("node")
        .args(["--test", "--test-reporter=tap"])
        .arg(root.join("studio/tools/sidebar_tool_access.test.mjs"))
        .output()
        .expect("the locked SDK supplies Node");
    let report = String::from_utf8_lossy(&output.stdout);
    assert!(
        output.status.success(),
        "{report}\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
    for required in [
        "# tests 4",
        "# pass 4",
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

/// `FA-92`: Theater, right after Library in the sidebar, plays Prism apps one after another on a stage beside an up next rail, under the build preview's own sandbox, with the floor's catalogue, covers and bookmarks, and its look is the experience spec's five Theater statements
#[test]
fn theater_fa_92() {
    // The screen is read as built: the sidebar, the router patch and the floor's module that holds the stage.
    let spec = include_str!("../../../studio/experience/src/FoundryExperience.lex.tex");
    let sidebar = include_str!("../../../studio/vendor/dyad/hologram.screens/AppSidebar.tsx");
    let screens = include_str!("../../../studio/vendor/dyad/hologram.screens.mjs");
    let theater =
        include_str!("../../../studio/vendor/dyad/hologram.screens/FeaturedAppShowcase.tsx");
    let preview =
        include_str!("../../../studio/vendor/dyad/src/components/preview_panel/PreviewIframe.tsx");
    for name in [
        "theaterInSidebar",
        "theaterStage",
        "theaterDetails",
        "theaterUpNext",
        "theaterKeys",
    ] {
        assert!(spec.contains(&format!("name: {name},")), "{name}");
    }
    let library = sidebar
        .find(r#"{ title: "Library", to: "/library""#)
        .expect("Library");
    let next = &sidebar[library..];
    let next = &next[next.find('\n').expect("line") + 1..];
    assert!(next
        .trim_start()
        .starts_with(r#"{ title: "Theater", to: "/theater", icon: MonitorPlay },"#));
    assert!(sidebar.contains(r#"["/theater", "Theater"],"#));
    assert!(
        !sidebar.contains(r#"const OPTIONAL = ["/templates", "/library", "/plugins", "/theater"]"#)
    );
    assert!(screens.contains(r#"path: "/theater", component: TheaterPage"#));
    assert!(screens.contains(r#"import { TheaterPage } from "./components/FeaturedAppShowcase";"#));
    assert!(theater.contains("export function TheaterPage()"));
    let sandbox = preview
        .split(r#"sandbox=""#)
        .nth(1)
        .expect("preview sandbox");
    let sandbox = &sandbox[..sandbox.find('"').expect("end")];
    assert!(theater.contains(&format!(r#"sandbox="{sandbox}""#)));
    for token in [
        "useCurrentAppUrl(",
        "runApp(",
        "featuredApps as Featured[]",
        "useBookmarks()",
        "<Cover hue=",
        r#"data-slot="home-featured-views""#,
        "aspect-video",
        "max-h-[61.8vh]",
        "w-[377px]",
        "h-[89px] w-[144px]",
        "search: { play:",
        r#"event.key === "f""#,
        r#"event.key === "t""#,
        r#"event.key === "N""#,
        "homeChatInputValueAtom",
    ] {
        assert!(theater.contains(token), "{token}");
    }
}
