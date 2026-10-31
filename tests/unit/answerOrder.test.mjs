import assert from "node:assert/strict";
import test from "node:test";
import { classicAnswerOrder } from "../../app/answerOrder.ts";
import { regions } from "../../app/gameData.ts";
import { judgeImageAnswer } from "../../app/imageAnswerAuthority.ts";
import { legacyImageQuestionStableId } from "../../app/imageQuestionPresentation.ts";

test("each canonical choice visits A, B, C and D equally without changing authority", () => {
  for (const [edition, region] of Object.entries(regions)) {
    for (let game = 0; game < 40; game++) {
      const positions = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
      for (const [index, question] of region.questions.entries()) {
        const order = classicAnswerOrder(`game-${game}`, edition, index, 4);
        assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
        assert.deepEqual(order, classicAnswerOrder(`game-${game}`, edition, index, 4));
        order.forEach((canonical, display) => positions[canonical][display]++);
        const displayedCorrect = question.correct.map(canonical => order.indexOf(canonical));
        assert.deepEqual(displayedCorrect.map(display => order[display]), question.correct);
        if (question.kind === "image") {
          const choice = displayedCorrect.map(display => `o${order[display] + 1}`);
          assert.equal(judgeImageAnswer(legacyImageQuestionStableId(edition, index), choice)?.correct, true);
        }
      }
      assert.deepEqual(positions, Array.from({ length: 4 }, () => [3, 3, 3, 3]));
    }
  }
});

test("new games change order; no ABCD rotation is reused every four questions", () => {
  const a = Array.from({ length: 12 }, (_, i) => classicAnswerOrder("fresh-a", "west", i, 4));
  const b = Array.from({ length: 12 }, (_, i) => classicAnswerOrder("fresh-b", "west", i, 4));
  assert.notDeepEqual(a, b);
  assert.notDeepEqual(a.slice(0, 4), a.slice(4, 8));
  assert.deepEqual(classicAnswerOrder(null, "west", 0, 4), [0, 1, 2, 3]);
});
