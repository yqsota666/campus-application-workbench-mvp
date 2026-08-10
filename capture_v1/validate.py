import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    sources = load_json(ROOT / "sources.json")
    profile = load_json(ROOT / "profile.json")
    preferences = load_json(ROOT / "preferences.json")
    schema = load_json(ROOT / "job.schema.json")
    sample = load_json(ROOT / "samples" / "demo_job.json")

    # 1. Source registry
    assert len(sources["sources"]) >= 3, "sources should include at least three channels"

    # 2. Profile and preferences
    assert profile["basic"]["name"] == "示例候选人", "profile name mismatch"
    assert "skills" in profile and len(profile["skills"]) >= 10, "skills look incomplete"
    assert "地区A" in preferences["target_regions"], "target regions missing configured region"
    assert preferences["target_company_types"] == ["configured_company_type"], "company type preference mismatch"

    # 3. Schema and sample structure
    assert schema["required"], "schema must define required fields"
    assert sample["status"] in schema["properties"]["status"]["enum"], "sample status not allowed"

    required = set(schema["required"])
    missing = required - set(sample.keys())
    assert not missing, f"sample missing required fields: {missing}"

    # 4. Fit / routing expectations
    assert sample["fit_score"] >= 0.8, "sample should be a strong fit"
    assert sample["status"] == "needs_review", "sample should stop at manual review"

    print("Capture V1 validation passed.")
    print(f"Sources: {len(sources['sources'])}")
    print(f"Profile skills: {len(profile['skills'])}")
    print(f"Target regions: {', '.join(preferences['target_regions'])}")
    print(f"Sample status: {sample['status']}")


if __name__ == "__main__":
    main()
