from pathlib import Path

import pytest

from scripts.assert_detection import evaluate, main, parse_junit

FIXTURES = Path(__file__).parent / "fixtures"
VULNERABLE = FIXTURES / "junit_vulnerable_with_error.xml"
HARDENED = FIXTURES / "junit_hardened_with_error.xml"
ERRORED_CASE = "tests.api.test_api1::test_setup_error"


def test_an_errored_test_is_not_counted_as_a_detection() -> None:
    report = parse_junit(VULNERABLE)

    assert report.categories["API1"].failed == []
    assert report.categories["API2"].failed == ["tests.api.test_api2::test_detects_flaw"]
    assert report.errored == [ERRORED_CASE]


def test_a_category_detected_only_by_an_error_is_missed_in_vulnerable_mode() -> None:
    rows, problems = evaluate(parse_junit(VULNERABLE), "vulnerable")

    assert "| API1 | Broken Object Level Authorization | 1 | 0 | MISSED |" in rows
    assert "API1 seeded flaw was not detected by any test" in problems
    assert f"Tests errored instead of passing or failing: {ERRORED_CASE}" in problems


def test_an_errored_test_fails_the_hardened_run() -> None:
    rows, problems = evaluate(parse_junit(HARDENED), "hardened")

    assert all(row.endswith("| SECURE |") for row in rows)
    assert problems == [f"Tests errored instead of passing or failing: {ERRORED_CASE}"]


@pytest.mark.parametrize(("mode", "junit"), [("vulnerable", VULNERABLE), ("hardened", HARDENED)])
def test_an_errored_test_makes_the_check_exit_non_zero(mode: str, junit: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)

    assert main(["--mode", mode, "--junit", str(junit)]) == 1
