use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeBusterReport {
    actionable_finding_count: u64,
    #[serde(default)]
    advisory_summary: AdvisorySummary,
    detailed_finding_count: u64,
    files: u64,
    #[serde(default)]
    findings: Vec<CodeBusterFinding>,
}

#[derive(Debug, Default, Deserialize)]
struct AdvisorySummary {
    #[serde(default)]
    groups: BTreeMap<String, u64>,
    #[serde(default)]
    total: u64,
}

#[derive(Debug, Deserialize)]
struct CodeBusterFinding {
    code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub project_name: String,
    pub path: String,
    pub file_count: u64,
    pub actionable_count: u64,
    pub advisory_count: u64,
    pub total_findings: u64,
    pub score: u32,
    pub findings_per_file: f64,
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
    let project_name = project_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("project")
        .to_owned();
    let (score, findings_per_file) = spaghetti_metrics(
        report.files,
        report.actionable_finding_count,
        report.advisory_summary.total,
    );

    let mut rule_counts = BTreeMap::<String, u64>::new();
    for finding in report.findings {
        *rule_counts.entry(finding.code).or_default() += 1;
    }
    let top_rules = sorted_counts(rule_counts, 5);
    let groups = sorted_counts(report.advisory_summary.groups, 6);

    Ok(ScanReport {
        project_name,
        path: project_path.to_string_lossy().into_owned(),
        file_count: report.files,
        actionable_count: report.actionable_finding_count,
        advisory_count: report.advisory_summary.total,
        total_findings: report.detailed_finding_count,
        score,
        findings_per_file,
        duration_ms,
        groups,
        top_rules,
    })
}

fn sorted_counts(counts: BTreeMap<String, u64>, limit: usize) -> Vec<CountedLabel> {
    let mut counts = counts.into_iter().collect::<Vec<_>>();
    counts.sort_by(|(left_label, left_count), (right_label, right_count)| {
        right_count
            .cmp(left_count)
            .then_with(|| left_label.cmp(right_label))
    });
    counts
        .into_iter()
        .take(limit)
        .map(|(label, count)| CountedLabel { label, count })
        .collect()
}

fn spaghetti_metrics(file_count: u64, actionable: u64, advisory: u64) -> (u32, f64) {
    if file_count == 0 {
        return (0, 0.0);
    }

    let weighted_findings = actionable.saturating_mul(3).saturating_add(advisory) as f64;
    let findings_per_file = weighted_findings / file_count as f64;
    let effective_file_count = file_count.max(10) as f64;
    let score = (weighted_findings / effective_file_count * 100.0)
        .round()
        .clamp(0.0, f64::from(u32::MAX)) as u32;

    (score, findings_per_file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_report_and_orders_rule_counts() {
        let report = br#"{
            "actionableFindingCount": 2,
            "advisorySummary": {
                "groups": {"style": 3, "performance": 1},
                "total": 4
            },
            "detailedFindingCount": 6,
            "files": 10,
            "findings": [
                {"code": "long-function"},
                {"code": "duplicate-block"},
                {"code": "long-function"}
            ]
        }"#;

        let parsed = parse_report(report, Path::new("/tmp/noodle-shop"), 123).unwrap();

        assert_eq!(parsed.project_name, "noodle-shop");
        assert_eq!(parsed.file_count, 10);
        assert_eq!(parsed.actionable_count, 2);
        assert_eq!(parsed.advisory_count, 4);
        assert_eq!(parsed.total_findings, 6);
        assert_eq!(parsed.duration_ms, 123);
        assert_eq!(parsed.top_rules[0].label, "long-function");
        assert_eq!(parsed.top_rules[0].count, 2);
        assert_eq!(parsed.groups[0].label, "style");
        assert_eq!(parsed.score, 100);
    }

    #[test]
    fn clean_projects_score_zero() {
        let (score, density) = spaghetti_metrics(100, 0, 0);

        assert_eq!(score, 0);
        assert_eq!(density, 0.0);
    }

    #[test]
    fn one_weighted_finding_per_file_scores_one_hundred() {
        let (score, density) = spaghetti_metrics(100, 20, 40);

        assert_eq!(score, 100);
        assert_eq!(density, 1.0);
    }

    #[test]
    fn score_can_exceed_one_hundred() {
        let expected = spaghetti_metrics(100, 20, 40);
        let messy = spaghetti_metrics(100, 30, 60);

        assert_eq!(expected.0, 100);
        assert_eq!(messy.0, 150);
        assert!(messy.0 > expected.0);
    }

    #[test]
    fn small_projects_use_a_ten_file_denominator() {
        assert_eq!(spaghetti_metrics(1, 0, 1).0, 10);
        assert_eq!(spaghetti_metrics(5, 0, 10).0, 100);
    }

    #[test]
    fn empty_selection_scores_zero() {
        assert_eq!(spaghetti_metrics(0, 10, 20), (0, 0.0));
    }
}
