"""Η αγωνιστική του Fantasy που προτείνεται: κλείνει στο πρώτο τζάμπολ, όχι όταν τελειώσουν όλοι οι αγώνες."""
from datetime import datetime, timezone

from run import fantasy_target

# [round, MMDDHHmmY (UTC), home, away, hs, as, done]
G = [
    [12, "111716006", "DUB", "IST", 80, 75, True],
    [12, "111819006", "BES", "MAD", 0, 0, False],   # διπλή εβδομάδα: τελευταίος αγώνας της 12ης την Τετάρτη
    [13, "111917156", "TEL", "DUB", 0, 0, False],
]


def at(m, d, h):
    return datetime(2026, m, d, h, tzinfo=timezone.utc)


def test_before_first_tipoff_the_round_is_open():
    assert fantasy_target(G, at(11, 17, 10)) == 12


def test_after_first_tipoff_moves_to_next_round_even_with_games_left():
    assert fantasy_target(G, at(11, 18, 12)) == 13


def test_last_open_round_already_started_falls_back_to_it():
    assert fantasy_target([g for g in G if g[0] == 12], at(11, 18, 12)) == 12
