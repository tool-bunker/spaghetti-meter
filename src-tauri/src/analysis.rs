use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeBusterReport {
    schema_version: u64,
    actionable_finding_count: u64,
    advisory_summary: AdvisorySummary,
    detailed_finding_count: u64,
    files: u64,
    source_metrics: SourceMetrics,
    findings: Vec<CodeBusterFinding>,
}

#[derive(Debug, Deserialize)]
struct AdvisorySummary {
    groups: BTreeMap<String, u64>,
    total: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceMetrics {
    schema_version: u64,
    code_lines: u64,
    file_code_lines: BTreeMap<String, u64>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd)]
#[serde(rename_all = "lowercase")]
enum FindingMode {
    Report,
    Count,
}

#[derive(Debug, Deserialize)]
struct CodeBusterFinding {
    code: String,
    path: String,
    mode: FindingMode,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub project_name: String,
    pub project_version: Option<String>,
    pub path: String,
    pub file_count: u64,
    pub code_lines: u64,
    pub actionable_count: u64,
    pub advisory_count: u64,
    pub total_findings: u64,
    pub score: u32,
    pub duration_ms: u64,
    pub groups: Vec<CountedLabel>,
    pub top_rules: Vec<CountedLabel>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountedLabel {
    pub label: String,
    pub count: u64,
}

pub fn parse_report(
    stdout: &[u8],
    project_path: &Path,
    duration_ms: u64,
) -> Result<ScanReport, String> {
    let report: CodeBusterReport = serde_json::from_slice(stdout)
        .map_err(|error| format!("Code Buster returned invalid JSON: {error}"))?;
    validate_report(&report)?;
    let score = spaghetti_score(&report);
    let project_name = project_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("project")
        .to_owned();
    let project_version = project_version(project_path);
    let mut rule_counts = BTreeMap::<&str, u64>::new();
    for finding in &report.findings {
        *rule_counts.entry(finding.code.as_str()).or_default() += 1;
    }
    let top_rules = sorted_counts(rule_counts, 5);
    let groups = sorted_counts(report.advisory_summary.groups, 6);

    Ok(ScanReport {
        project_name,
        project_version,
        path: project_path.to_string_lossy().into_owned(),
        file_count: report.files,
        code_lines: report.source_metrics.code_lines,
        actionable_count: report.actionable_finding_count,
        advisory_count: report.advisory_summary.total,
        total_findings: report.detailed_finding_count,
        score,
        duration_ms,
        groups,
        top_rules,
    })
}

fn project_version(project_path: &Path) -> Option<String> {
    ["package.json", "deno.json", "composer.json"]
        .into_iter()
        .find_map(|file_name| json_version(&project_path.join(file_name)))
        .or_else(|| {
            let cargo = project_path.join("Cargo.toml");
            toml_version(&cargo, &["package", "version"])
                .or_else(|| toml_version(&cargo, &["workspace", "package", "version"]))
        })
        .or_else(|| {
            let pyproject = project_path.join("pyproject.toml");
            toml_version(&pyproject, &["project", "version"])
                .or_else(|| toml_version(&pyproject, &["tool", "poetry", "version"]))
        })
        .or_else(|| pubspec_version(&project_path.join("pubspec.yaml")))
}

fn json_version(path: &Path) -> Option<String> {
    let contents = fs::read(path).ok()?;
    let manifest: serde_json::Value = serde_json::from_slice(&contents).ok()?;
    clean_version(manifest.get("version")?.as_str()?)
}

fn toml_version(path: &Path, keys: &[&str]) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    let manifest = contents.parse::<toml::Value>().ok()?;
    let mut value = &manifest;
    for key in keys {
        value = value.get(*key)?;
    }
    clean_version(value.as_str()?)
}

fn pubspec_version(path: &Path) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    contents.lines().find_map(|line| {
        let value = line.strip_prefix("version:")?.trim();
        let value = value.split_once(" #").map_or(value, |(version, _)| version);
        clean_version(value.trim_matches(['"', '\'']))
    })
}

fn clean_version(version: &str) -> Option<String> {
    let version = version.trim();
    (!version.is_empty()).then(|| version.to_owned())
}

fn sorted_counts<T: Ord + Into<String>>(
    counts: BTreeMap<T, u64>,
    limit: usize,
) -> Vec<CountedLabel> {
    let mut counts = counts.into_iter().collect::<Vec<_>>();
    counts.sort_by(|(left_label, left_count), (right_label, right_count)| {
        right_count
            .cmp(left_count)
            .then_with(|| left_label.cmp(right_label))
    });
    counts
        .into_iter()
        .take(limit)
        .map(|(label, count)| CountedLabel {
            label: label.into(),
            count,
        })
        .collect()
}

fn validate_report(report: &CodeBusterReport) -> Result<(), String> {
    if report.schema_version != 3 {
        return Err(
            "Code Buster returned an unsupported report schema; expected schemaVersion 3"
                .to_owned(),
        );
    }
    let metrics = &report.source_metrics;
    if metrics.schema_version != 1 {
        return Err("Code Buster returned unsupported source metrics; expected sourceMetrics.schemaVersion 1".to_owned());
    }
    if metrics.file_code_lines.len() as u64 != report.files {
        return Err("Code Buster source metrics do not cover every selected file".to_owned());
    }
    let measured_total = metrics
        .file_code_lines
        .values()
        .try_fold(0_u64, |total, lines| total.checked_add(*lines));
    if measured_total != Some(metrics.code_lines) {
        return Err("Code Buster source metrics have an inconsistent code-line total".to_owned());
    }
    let finding_total = report
        .actionable_finding_count
        .checked_add(report.advisory_summary.total);
    if finding_total != Some(report.detailed_finding_count)
        || report.findings.len() as u64 != report.detailed_finding_count
    {
        return Err("Code Buster returned incomplete or inconsistent finding totals".to_owned());
    }
    let advisory_total = report
        .advisory_summary
        .groups
        .values()
        .try_fold(0_u64, |total, count| total.checked_add(*count));
    if advisory_total != Some(report.advisory_summary.total) {
        return Err("Code Buster returned inconsistent advisory group totals".to_owned());
    }
    let actionable = report
        .findings
        .iter()
        .filter(|finding| finding.mode == FindingMode::Report)
        .count() as u64;
    if actionable != report.actionable_finding_count {
        return Err("Code Buster finding modes do not match the reported totals".to_owned());
    }
    if !report.findings.is_empty() && metrics.code_lines == 0 {
        return Err("Code Buster reported findings without measured source code".to_owned());
    }
    Ok(())
}

fn spaghetti_score(report: &CodeBusterReport) -> u32 {
    if report.findings.is_empty() {
        return 0;
    }

    let metrics = &report.source_metrics;
    let denominator = metrics.code_lines.max(1_000) as f64;
    let mut buckets = BTreeMap::<(&str, &str, FindingMode), u64>::new();
    for finding in &report.findings {
        *buckets
            .entry((&finding.path, &finding.code, finding.mode))
            .or_default() += 1;
    }
    let score: f64 = buckets
        .into_iter()
        .map(|((path, _, mode), count)| {
            let local = metrics
                .file_code_lines
                .get(path)
                .copied()
                .unwrap_or(metrics.code_lines)
                .max(1) as f64;
            let weight = match mode {
                FindingMode::Report => 3.0,
                FindingMode::Count => 1.0,
            };
            100.0 * weight * local / denominator * (100.0 * count as f64 / local).ln_1p()
                / std::f64::consts::LN_2
        })
        .sum();
    score.round().clamp(1.0, f64::from(u32::MAX)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn report_value(files: &[(&str, u64)], findings: &[(&str, &str, &str)]) -> Value {
        let file_code_lines = files
            .iter()
            .map(|(path, lines)| ((*path).to_owned(), *lines))
            .collect::<BTreeMap<_, _>>();
        let actionable = findings
            .iter()
            .filter(|(_, _, mode)| *mode == "report")
            .count();
        let advisory = findings.len() - actionable;
        json!({
            "schemaVersion": 3,
            "files": files.len(),
            "sourceMetrics": {
                "schemaVersion": 1,
                "codeLines": files.iter().map(|(_, lines)| lines).sum::<u64>(),
                "fileCodeLines": file_code_lines,
            },
            "actionableFindingCount": actionable,
            "advisorySummary": {
                "total": advisory,
                "groups": if advisory == 0 { json!({}) } else { json!({"maintainability": advisory}) },
            },
            "detailedFindingCount": findings.len(),
            "findings": findings.iter().map(|(path, code, mode)| json!({
                "path": path,
                "code": code,
                "mode": mode,
                "severity": "warn",
            })).collect::<Vec<_>>(),
        })
    }

    fn parse_value(value: &Value) -> Result<ScanReport, String> {
        parse_report(
            &serde_json::to_vec(value).unwrap(),
            Path::new("/tmp/noodle-shop"),
            123,
        )
    }

    fn repeated_score(lines: u64, count: usize, code: &str, mode: &str) -> u32 {
        let findings = vec![("src/main.rs", code, mode); count];
        parse_value(&report_value(&[("src/main.rs", lines)], &findings))
            .unwrap()
            .score
    }

    #[test]
    fn parses_report_and_orders_rule_counts() {
        let mut report = report_value(
            &[("src/main.rs", 1_000), ("empty.rs", 0)],
            &[
                ("src/main.rs", "long-function", "report"),
                ("src/main.rs", "duplicate-block", "report"),
                ("src/main.rs", "long-function", "count"),
                ("src/main.rs", "long-function", "count"),
                ("src/main.rs", "naming-convention", "count"),
                ("src/main.rs", "security-risk", "count"),
            ],
        );
        report["advisorySummary"]["groups"] = json!({"style": 3, "performance": 1});
        let parsed = parse_value(&report).unwrap();

        assert_eq!(parsed.project_name, "noodle-shop");
        assert_eq!(parsed.file_count, 2);
        assert_eq!(parsed.code_lines, 1_000);
        assert_eq!(parsed.actionable_count, 2);
        assert_eq!(parsed.advisory_count, 4);
        assert_eq!(parsed.total_findings, 6);
        assert_eq!(parsed.duration_ms, 123);
        assert_eq!(parsed.top_rules[0].label, "long-function");
        assert_eq!(parsed.top_rules[0].count, 3);
        assert_eq!(parsed.groups[0].label, "style");
        assert!(parsed.score > 0);
    }

    #[test]
    fn discovers_versions_from_common_root_manifests() {
        let cases = [
            ("package.json", r#"{"version":"1.2.3"}"#, "1.2.3"),
            ("Cargo.toml", "[package]\nversion = \"2.3.4\"\n", "2.3.4"),
            (
                "pyproject.toml",
                "[project]\nversion = \"3.4.5\"\n",
                "3.4.5",
            ),
            (
                "pubspec.yaml",
                "name: noodles\nversion: 4.5.6+7\n",
                "4.5.6+7",
            ),
        ];

        for (file_name, contents, expected) in cases {
            let directory = std::env::temp_dir().join(format!(
                "spaghetti-meter-version-{}-{}",
                file_name.replace(['.', '/'], "-"),
                std::process::id(),
            ));
            let _ = fs::remove_dir_all(&directory);
            fs::create_dir_all(&directory).unwrap();
            fs::write(directory.join(file_name), contents).unwrap();

            assert_eq!(project_version(&directory).as_deref(), Some(expected));

            fs::remove_dir_all(directory).unwrap();
        }
    }

    #[test]
    fn no_findings_score_zero_including_empty_and_zero_code_selections() {
        for files in [
            vec![],
            vec![("comments.rs", 0)],
            vec![("src/main.rs", 10_000)],
        ] {
            assert_eq!(parse_value(&report_value(&files, &[])).unwrap().score, 0);
        }
    }

    #[test]
    fn repeated_findings_have_concave_not_linear_contributions() {
        let ten = repeated_score(1_000, 10, "long-function", "count");
        let twenty = repeated_score(1_000, 20, "long-function", "count");
        let thirty = repeated_score(1_000, 30, "long-function", "count");
        assert_eq!((ten, twenty, thirty), (100, 158, 200));
        assert!(twenty - ten > thirty - twenty);
        assert!(twenty < 2 * ten);
    }

    #[test]
    fn same_density_growth_and_proportional_file_splitting_preserve_score() {
        let original = repeated_score(1_000, 10, "long-function", "count");
        let grown = repeated_score(2_000, 20, "long-function", "count");
        let mut findings = vec![("src/a.rs", "long-function", "count"); 10];
        findings.extend(vec![("src/b.rs", "long-function", "count"); 10]);
        let split = parse_value(&report_value(
            &[("src/a.rs", 1_000), ("src/b.rs", 1_000)],
            &findings,
        ))
        .unwrap();
        assert_eq!(original, 100);
        assert_eq!(grown, original);
        assert_eq!(split.score, original);
    }

    #[test]
    fn modes_weigh_three_to_one_independent_of_category_or_severity() {
        for code in ["long-function", "naming-convention", "security-risk"] {
            let advisory = repeated_score(1_000, 10, code, "count");
            let actionable = repeated_score(1_000, 10, code, "report");
            assert_eq!(advisory, 100);
            assert_eq!(actionable, 3 * advisory);
        }
        let mut report = report_value(
            &[("src/main.rs", 1_000)],
            &[("src/main.rs", "security-risk", "count"); 10],
        );
        for severity in ["error", "info"] {
            for finding in report["findings"].as_array_mut().unwrap() {
                finding["severity"] = json!(severity);
            }
            assert_eq!(parse_value(&report).unwrap().score, 100);
        }
    }

    #[test]
    fn each_rule_and_mode_has_its_own_bucket() {
        let mut findings = vec![("src/main.rs", "long-function", "report"); 10];
        findings.extend(vec![("src/main.rs", "long-function", "count"); 10]);
        let report = report_value(&[("src/main.rs", 1_000)], &findings);
        assert_eq!(parse_value(&report).unwrap().score, 400);
        let mut findings = vec![("src/main.rs", "long-function", "count"); 10];
        findings.extend(vec![("src/main.rs", "naming-convention", "count"); 10]);
        let report = report_value(&[("src/main.rs", 1_000)], &findings);
        assert_eq!(parse_value(&report).unwrap().score, 200);
    }

    #[test]
    fn tiny_projects_use_a_thousand_line_floor_and_zero_line_files_use_one() {
        assert_eq!(repeated_score(100, 1, "long-function", "count"), 10);
        assert_eq!(repeated_score(200, 2, "long-function", "count"), 20);
        let report = report_value(
            &[("comments.rs", 0), ("src/main.rs", 1_000)],
            &[("comments.rs", "naming-convention", "count")],
        );
        assert_eq!(parse_value(&report).unwrap().score, 1);
    }

    #[test]
    fn project_and_non_source_findings_use_total_project_code_lines() {
        for path in ["", ".", "Cargo.toml", "project"] {
            let report = report_value(
                &[("src/a.rs", 1_000), ("src/b.rs", 2_000)],
                &vec![(path, "project-structure", "count"); 30],
            );
            assert_eq!(parse_value(&report).unwrap().score, 100);
        }
    }

    #[test]
    fn findings_without_measured_code_are_rejected() {
        for files in [vec![], vec![("comments.rs", 0)]] {
            let report = report_value(&files, &[("Cargo.toml", "project-structure", "count")]);
            assert!(parse_value(&report).is_err());
        }
    }

    #[test]
    fn positive_findings_never_round_to_zero() {
        assert_eq!(repeated_score(u64::MAX, 1, "long-function", "count"), 1);
        assert_eq!(repeated_score(1, 1, "long-function", "count"), 1);
    }

    #[test]
    fn missing_required_report_fields_and_legacy_output_are_rejected() {
        let report = report_value(&[("src/main.rs", 1_000)], &[]);
        for field in [
            "schemaVersion",
            "files",
            "sourceMetrics",
            "actionableFindingCount",
            "advisorySummary",
            "detailedFindingCount",
            "findings",
        ] {
            let mut incomplete = report.clone();
            incomplete.as_object_mut().unwrap().remove(field);
            assert!(parse_value(&incomplete).is_err(), "missing {field}");
        }
        for field in ["schemaVersion", "codeLines", "fileCodeLines"] {
            let mut incomplete = report.clone();
            incomplete["sourceMetrics"]
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(parse_value(&incomplete).is_err(), "missing metric {field}");
        }
        for field in ["groups", "total"] {
            let mut incomplete = report.clone();
            incomplete["advisorySummary"]
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(
                parse_value(&incomplete).is_err(),
                "missing advisory {field}"
            );
        }
        for field in ["mode", "path", "code"] {
            let mut incomplete = report_value(
                &[("src/main.rs", 1_000)],
                &[("src/main.rs", "long-function", "count")],
            );
            incomplete["findings"][0]
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(parse_value(&incomplete).is_err(), "missing finding {field}");
        }
    }

    #[test]
    fn unknown_schemas_and_modes_are_rejected() {
        let report = report_value(
            &[("src/main.rs", 1_000)],
            &[("src/main.rs", "long-function", "count")],
        );
        for version in [0, 2, 4] {
            let mut unknown = report.clone();
            unknown["schemaVersion"] = json!(version);
            assert!(parse_value(&unknown).is_err());
        }
        for version in [0, 2] {
            let mut unknown = report.clone();
            unknown["sourceMetrics"]["schemaVersion"] = json!(version);
            assert!(parse_value(&unknown).is_err());
        }
        for mode in ["off", "advisory", "REPORT", ""] {
            let mut unknown = report.clone();
            unknown["findings"][0]["mode"] = json!(mode);
            assert!(parse_value(&unknown).is_err());
        }
    }

    #[test]
    fn inconsistent_and_truncated_reports_are_rejected() {
        let report = report_value(
            &[("src/main.rs", 1_000)],
            &[("src/main.rs", "long-function", "count")],
        );
        for (pointer, value) in [
            ("/files", json!(2)),
            ("/sourceMetrics/codeLines", json!(999)),
            ("/sourceMetrics/fileCodeLines", json!({})),
            ("/detailedFindingCount", json!(2)),
            ("/actionableFindingCount", json!(1)),
            ("/advisorySummary/total", json!(0)),
            ("/advisorySummary/groups", json!({})),
            ("/findings", json!([])),
            ("/findings/0/mode", json!("report")),
        ] {
            let mut inconsistent = report.clone();
            *inconsistent.pointer_mut(pointer).unwrap() = value;
            assert!(
                parse_value(&inconsistent).is_err(),
                "inconsistent {pointer}"
            );
        }
        let bytes = serde_json::to_vec(&report).unwrap();
        assert!(parse_report(&bytes[..bytes.len() - 1], Path::new("/tmp"), 0).is_err());
        assert!(parse_report(b"", Path::new("/tmp"), 0).is_err());
    }

    #[test]
    fn overflowing_metric_and_summary_totals_are_rejected() {
        let mut report = report_value(&[("src/main.rs", 1_000)], &[]);
        report["files"] = json!(2);
        report["sourceMetrics"]["codeLines"] = json!(0);
        report["sourceMetrics"]["fileCodeLines"] = json!({"a.rs": u64::MAX, "b.rs": 1});
        assert!(parse_value(&report).is_err());

        let mut report = report_value(&[], &[]);
        report["actionableFindingCount"] = json!(u64::MAX);
        report["advisorySummary"]["total"] = json!(1);
        assert!(parse_value(&report).is_err());

        let mut report = report_value(&[], &[]);
        report["advisorySummary"]["groups"] = json!({"style": u64::MAX, "security": 1});
        assert!(parse_value(&report).is_err());
    }
}
