import test from "node:test";
import assert from "node:assert/strict";
import {
  compareLevelFilenames,
  looksLikePuzzlePayload,
} from "../../solver/meta_levels";

test("compareLevelFilenames sorts numbered levels numerically", () => {
  const files = ["10.json", "2.json", "1.json", "index.json"];
  files.sort(compareLevelFilenames);
  assert.deepEqual(files.slice(0, 3), ["1.json", "2.json", "10.json"]);
});

test("looksLikePuzzlePayload detects puzzle-shaped payloads", () => {
  assert.equal(
    looksLikePuzzlePayload({
      id: "level_001",
      player: { hand: [] },
      opponent: { health: 1, board: [] },
    }),
    true
  );
  assert.equal(looksLikePuzzlePayload({ id: "manifest", levels: [] }), false);
});
