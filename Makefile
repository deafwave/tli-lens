BUILD := Rehan SS13_update1.json
PY := python -X utf8

.PHONY: test snapshot rank sens

test:
	$(PY) -m pytest dmg/tests -q

snapshot:
	$(PY) -m dmg.build_parser "$(BUILD)" -o dmg/snapshot.json

rank: snapshot
	$(PY) -m dmg.rank sensitivity dmg/snapshot.json

sens:
	$(PY) -m dmg.rank sensitivity dmg/snapshot.json
