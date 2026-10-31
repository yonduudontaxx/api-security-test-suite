"""Per-category verdict from a pytest JUnit report.

hardened: every OWASP category has tests and none fail.
vulnerable: every OWASP category has at least one failing test, so each seeded flaw was detected.
"""

import argparse
import os
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from apisec_suite import CATEGORIES, CATEGORY_PROPERTY


@dataclass
class CategoryResult:
    total: int = 0
    failed: list[str] = field(default_factory=list)


@dataclass
class Report:
    categories: dict[str, CategoryResult]
    untagged: list[str]
    skipped: list[str]
    errored: list[str]


def parse_junit(path: Path) -> Report:
    root = ET.parse(path).getroot()  # noqa: S314
    report = Report({key: CategoryResult() for key in CATEGORIES}, [], [], [])
    for case in root.iter("testcase"):
        name = f"{case.get('classname')}::{case.get('name')}"
        category = next(
            (prop.get("value") for prop in case.iter("property") if prop.get("name") == CATEGORY_PROPERTY),
            None,
        )
        if case.find("skipped") is not None:
            report.skipped.append(name)
        if case.find("error") is not None:
            report.errored.append(name)
        if category not in report.categories:
            report.untagged.append(name)
            continue
        result = report.categories[category]
        result.total += 1
        if case.find("failure") is not None:
            result.failed.append(name)
    return report


def evaluate(report: Report, mode: str) -> tuple[list[str], list[str]]:
    rows: list[str] = []
    problems: list[str] = []
    if report.untagged:
        problems.append(f"Tests without an OWASP category marker: {', '.join(report.untagged)}")
    if report.skipped:
        problems.append(f"Skipped tests are not allowed: {', '.join(report.skipped)}")
    if report.errored:
        problems.append(f"Tests errored instead of passing or failing: {', '.join(report.errored)}")
    for key, title in CATEGORIES.items():
        result = report.categories[key]
        failed = len(result.failed)
        if result.total == 0:
            verdict = "NO TESTS"
            problems.append(f"{key} has no tests")
        elif mode == "vulnerable":
            verdict = "DETECTED" if failed else "MISSED"
            if not failed:
                problems.append(f"{key} seeded flaw was not detected by any test")
        else:
            verdict = "SECURE" if not failed else "FAILING"
            if failed:
                problems.append(f"{key} has {failed} failing test(s) against the hardened target")
        rows.append(f"| {key} | {title} | {result.total} | {failed} | {verdict} |")
    return rows, problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=["hardened", "vulnerable"], required=True)
    parser.add_argument("--junit", type=Path, default=Path("reports/junit.xml"))
    args = parser.parse_args(argv)

    report = parse_junit(args.junit)
    rows, problems = evaluate(report, args.mode)
    heading = (
        "### Vulnerable target: every OWASP category must be detected"
        if args.mode == "vulnerable"
        else "### Hardened target: every OWASP category must pass"
    )
    summary = "\n".join(
        [heading, "", "| Category | Name | Tests | Failed | Verdict |", "| --- | --- | ---: | ---: | --- |", *rows, ""]
    )
    print(summary)
    if step_summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(step_summary, "a", encoding="utf-8") as handle:
            handle.write(summary + "\n")

    if args.mode == "vulnerable":
        for key, result in report.categories.items():
            if result.failed:
                print(f"{key} detections:\n  - " + "\n  - ".join(result.failed))

    if problems:
        print("\n" + "\n".join(problems), file=sys.stderr)
        return 1
    print("All 10 categories detected." if args.mode == "vulnerable" else "All 10 categories secure.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
