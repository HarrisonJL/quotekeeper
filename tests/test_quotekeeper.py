"""
Deterministic tests for QuoteKeeper using genlayer-test's Direct Mode.

Three layers, same structure as the sibling SolvencyOracle project:

1. Registration tests - clause parsing (strict_eq), input validation,
   immutability of the agreement registry.
2. Integration tests (real sample() calls, both the web fetch and the LLM
   extraction mocked): PASS/FAIL/INCONCLUSIVE verdicts, compliance_bps
   bookkeeping, source-hash recording.
3. Consensus-boundary tests via direct_vm.run_validator: the actual point
   of this contract - decision-margin equivalence. Direct Mode runs
   leader_fn directly and only *captures* validator_fn, so exact boundary
   tests re-invoke the captured closure via run_validator(leader_result=...),
   the same cheatcode proven in Ballpark and SolvencyOracle.
"""

import json

import pytest

URL = "https://example.com/venue1"
URL_2 = "https://example.com/venue2"


def _deploy(direct_vm, direct_deploy, owner):
    direct_vm.sender = owner
    return direct_deploy("contracts/quotekeeper.py")


def _mock_page(direct_vm, url, body):
    direct_vm.mock_web(url, {"method": "GET", "status": 200, "body": body})


def _mock_clause_llm(direct_vm, max_spread_bps, min_depth_usd):
    direct_vm.mock_llm(
        "Extract KPI thresholds",
        json.dumps({"max_spread_bps": max_spread_bps, "min_depth_usd": min_depth_usd}),
    )


def _mock_metrics_llm(direct_vm, spread_bps, depth_usd):
    direct_vm.mock_llm(
        "Extract live market-quality figures",
        json.dumps({"spread_bps": spread_bps, "depth_usd": depth_usd}),
    )


def _register(qk, direct_vm, agreement_id="MM1", max_spread_bps=200, min_depth_usd=50000, noise_bps=500, urls=None):
    urls = urls or [URL]
    _mock_clause_llm(direct_vm, max_spread_bps, min_depth_usd)
    qk.register_agreement(
        agreement_id, "Example MM", "Maintain a maximum spread of 2% and minimum depth of $50,000.", urls, noise_bps,
    )


# --- Registration -----------------------------------------------------------


def test_initial_state(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    assert qk.get_state() == {"agreement_count": 0, "sample_count": 0}


def test_register_agreement_succeeds_and_is_readable(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm)

    a = qk.get_agreement("MM1")
    assert a["mm_label"] == "Example MM"
    assert a["max_spread_bps"] == 200
    assert a["min_depth_usd"] == 50000
    assert a["noise_bps"] == 500
    assert json.loads(a["venue_urls_json"]) == [URL]
    assert a["pass_count"] == 0 and a["fail_count"] == 0 and a["inconclusive_count"] == 0

    assert qk.get_state()["agreement_count"] == 1
    assert qk.list_agreements() == [{"agreement_id": "MM1", "mm_label": "Example MM"}]
    assert qk.compliance_bps("MM1") == 10000  # no decisive sample yet -> reported compliant


def test_register_agreement_rejects_duplicate_id(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm)
    with pytest.raises(Exception):
        _register(qk, direct_vm)


def test_register_agreement_rejects_non_https_url(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _mock_clause_llm(direct_vm, 200, 50000)
    with pytest.raises(Exception):
        qk.register_agreement("MM1", "Example MM", "max spread 2%, min depth $50k", ["http://example.com"], 500)


def test_register_agreement_rejects_too_many_venues(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _mock_clause_llm(direct_vm, 200, 50000)
    with pytest.raises(Exception):
        qk.register_agreement("MM1", "Example MM", "clause", [URL, URL, URL, URL], 500)


def test_register_agreement_rejects_noise_bps_over_cap(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _mock_clause_llm(direct_vm, 200, 50000)
    with pytest.raises(Exception):
        qk.register_agreement("MM1", "Example MM", "clause", [URL], 2001)


def test_register_agreement_rejects_ambiguous_clause_missing_spread(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _mock_clause_llm(direct_vm, None, 50000)  # LLM couldn't find a spread KPI
    with pytest.raises(Exception):
        qk.register_agreement("MM1", "Example MM", "keep the market orderly", [URL], 500)


def test_register_agreement_rejects_ambiguous_clause_missing_depth(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _mock_clause_llm(direct_vm, 200, None)
    with pytest.raises(Exception):
        qk.register_agreement("MM1", "Example MM", "spread must stay under 2%", [URL], 500)


# --- Integration: real sample() calls, PASS/FAIL/INCONCLUSIVE --------------


def test_sample_pass_when_comfortably_within_kpis(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=100, depth_usd=100000)  # well inside both KPIs
    qk.sample("MM1")

    s = qk.get_sample(0)
    assert s["verdict"] == "PASS"
    assert s["spread_bps"] == 100
    assert s["depth_usd"] == 100000
    a = qk.get_agreement("MM1")
    assert a["pass_count"] == 1 and a["fail_count"] == 0
    assert qk.compliance_bps("MM1") == 10000
    assert qk.is_compliant("MM1", 9000) is True


def test_sample_fail_when_spread_too_wide(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=1000, depth_usd=100000)  # spread way over KPI
    qk.sample("MM1")

    assert qk.get_sample(0)["verdict"] == "FAIL"
    a = qk.get_agreement("MM1")
    assert a["fail_count"] == 1
    assert qk.compliance_bps("MM1") == 0


def test_sample_fail_when_depth_too_shallow(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=100, depth_usd=1000)  # depth way under KPI
    qk.sample("MM1")

    assert qk.get_sample(0)["verdict"] == "FAIL"


# A self-audit before submission found this: _local_verdict checked
# INCONCLUSIVE before FAIL, so a decisive breach on one metric got masked
# into INCONCLUSIVE whenever the other metric happened to land inside its
# own noise band. INCONCLUSIVE samples don't count toward compliance_bps's
# denominator, so an MM blowing through its spread cap on every sample
# could still read as 100% compliant forever, simply by keeping depth
# hovering near its own threshold. A confirmed breach on either metric
# must win regardless of the other metric's ambiguity.
def test_sample_fail_when_spread_decisively_fails_even_if_depth_is_borderline(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    # spread 1000 is a decisive FAIL (threshold 200, band 10).
    # depth 48000 is inside the noise band around 50000 (band 2500) -> INCONCLUSIVE on its own.
    _mock_metrics_llm(direct_vm, spread_bps=1000, depth_usd=48000)
    qk.sample("MM1")

    assert qk.get_sample(0)["verdict"] == "FAIL"
    a = qk.get_agreement("MM1")
    assert a["fail_count"] == 1 and a["inconclusive_count"] == 0


def test_sample_fail_when_depth_decisively_fails_even_if_spread_is_borderline(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    # spread 195 is inside the noise band around 200 (band 10) -> INCONCLUSIVE on its own.
    # depth 1000 is a decisive FAIL (threshold 50000, band 2500).
    _mock_metrics_llm(direct_vm, spread_bps=195, depth_usd=1000)
    qk.sample("MM1")

    assert qk.get_sample(0)["verdict"] == "FAIL"
    a = qk.get_agreement("MM1")
    assert a["fail_count"] == 1 and a["inconclusive_count"] == 0


def test_sample_inconclusive_when_extraction_yields_null(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm)
    _mock_page(direct_vm, URL, "page with no clear market data")
    _mock_metrics_llm(direct_vm, spread_bps=None, depth_usd=None)
    qk.sample("MM1")

    assert qk.get_sample(0)["verdict"] == "INCONCLUSIVE"
    a = qk.get_agreement("MM1")
    assert a["inconclusive_count"] == 1
    assert qk.compliance_bps("MM1") == 10000  # excluded from denominator, no decisive sample yet


def test_compliance_bps_excludes_inconclusive_from_denominator(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)

    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=100, depth_usd=100000)
    qk.sample("MM1")  # PASS

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=1000, depth_usd=100000)
    qk.sample("MM1")  # FAIL

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=None, depth_usd=None)
    qk.sample("MM1")  # INCONCLUSIVE - must not count in the denominator

    assert qk.compliance_bps("MM1") == 5000  # 1 pass / (1 pass + 1 fail) = 50%
    assert qk.is_compliant("MM1", 9000) is False
    assert qk.is_compliant("MM1", 4000) is True


def test_sample_records_a_source_hash_per_venue(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, urls=[URL, URL_2])
    _mock_page(direct_vm, URL, "venue one page")
    _mock_page(direct_vm, URL_2, "venue two page")
    _mock_metrics_llm(direct_vm, spread_bps=100, depth_usd=100000)
    qk.sample("MM1")

    hashes = json.loads(qk.get_sample(0)["source_hashes_json"])
    assert len(hashes) == 2
    assert hashes[0] != hashes[1]


def test_sample_rejects_unknown_agreement(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    with pytest.raises(Exception):
        qk.sample("NOPE")


# --- Consensus boundary: decision-margin equivalence, via run_validator ----


def test_validator_agrees_when_both_decisively_pass_different_numbers(direct_vm, direct_deploy, direct_owner):
    # The core claim of this design: validators don't need to agree on the
    # NUMBER, only the DECISION. 100 vs 150 bps spread are different
    # readings, but both are decisively under a 200bps threshold with a
    # 500bps noise band.
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=100, depth_usd=100000)
    qk.sample("MM1")  # captures validator_fn

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=150, depth_usd=90000)  # different numbers, still decisive PASS
    leader_result = json.dumps({"spread_bps": 100, "depth_usd": 100000, "source_hashes": []})
    assert direct_vm.run_validator(leader_result=leader_result) is True


def test_validator_rejects_leader_pass_on_borderline_reading(direct_vm, direct_deploy, direct_owner):
    # This is the scenario the design doc calls out by name: a leader
    # claiming a clean PASS on a reading that's actually within the noise
    # band of the threshold must be rejected, because an honest validator
    # computes INCONCLUSIVE for that same kind of borderline reading.
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=100, depth_usd=100000)
    qk.sample("MM1")  # captures validator_fn

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    # threshold 200, noise 500bps -> band = 200*500//10000 = 10 -> [190, 210] is INCONCLUSIVE
    _mock_metrics_llm(direct_vm, spread_bps=195, depth_usd=100000)
    leader_result = json.dumps({"spread_bps": 100, "depth_usd": 100000, "source_hashes": []})  # leader claims decisive PASS
    assert direct_vm.run_validator(leader_result=leader_result) is False


def test_validator_agrees_when_both_decisively_fail(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=1000, depth_usd=100000)
    qk.sample("MM1")

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=1500, depth_usd=100000)  # different number, still decisive FAIL
    leader_result = json.dumps({"spread_bps": 1000, "depth_usd": 100000, "source_hashes": []})
    assert direct_vm.run_validator(leader_result=leader_result) is True


def test_validator_rejects_pass_vs_fail(direct_vm, direct_deploy, direct_owner):
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=100, depth_usd=100000)
    qk.sample("MM1")

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=1000, depth_usd=100000)  # decisive FAIL
    leader_result = json.dumps({"spread_bps": 100, "depth_usd": 100000, "source_hashes": []})  # leader: decisive PASS
    assert direct_vm.run_validator(leader_result=leader_result) is False


def test_validator_agrees_at_exact_noise_band_edge(direct_vm, direct_deploy, direct_owner):
    # threshold 200, noise 500bps -> band = 10 -> value 190 is exactly on
    # the INCONCLUSIVE boundary. Both leader and validator landing exactly
    # on the same side of that edge should still agree.
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=189, depth_usd=100000)  # one past the band -> decisive PASS
    qk.sample("MM1")

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=185, depth_usd=100000)  # also decisive PASS
    leader_result = json.dumps({"spread_bps": 189, "depth_usd": 100000, "source_hashes": []})
    assert direct_vm.run_validator(leader_result=leader_result) is True


def test_validator_rejects_when_depth_metric_disagrees_even_if_spread_agrees(direct_vm, direct_deploy, direct_owner):
    # All-or-nothing across both metrics, same reasoning as SolvencyOracle
    # and Ballpark: one metric's local verdict disagreeing fails the whole
    # sample, even if the other metric is a clean match.
    qk = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(qk, direct_vm, max_spread_bps=200, min_depth_usd=50000, noise_bps=500)
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=100, depth_usd=100000)
    qk.sample("MM1")

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_metrics_llm(direct_vm, spread_bps=100, depth_usd=1000)  # depth decisively FAILs
    leader_result = json.dumps({"spread_bps": 100, "depth_usd": 100000, "source_hashes": []})  # leader: both PASS
    assert direct_vm.run_validator(leader_result=leader_result) is False
