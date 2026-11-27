// PLATFORM-008: readIntegerEnv rejects settings that are not whole numbers of
// at least `min`, so a typo cannot silently disable an AI or rate limit.
const test = require("node:test");
const assert = require("node:assert/strict");

require("./support/isolate");

const { readIntegerEnv } = require("../config/env");

const NAME = "RESUMECRAFT_TEST_INTEGER_SETTING";

function readWith(raw, defaultValue = 7, options) {
  if (raw === undefined) delete process.env[NAME];
  else process.env[NAME] = raw;
  try {
    return readIntegerEnv(NAME, defaultValue, options);
  } finally {
    delete process.env[NAME];
  }
}

test("rejects values that are not whole numbers of at least 1", () => {
  for (const raw of ["abc", "0", "2.5", "-1", "12s", "1e3", "0x10", "9007199254740993"]) {
    assert.throws(
      () => readWith(raw),
      (error) => {
        assert.equal(error.message, `${NAME} must be a whole number of at least 1.`);
        return true;
      },
      `${JSON.stringify(raw)} should be rejected`,
    );
  }
});

test("the error names the setting but never echoes its value", () => {
  const secretLooking = "sk-not-a-number-4242";
  assert.throws(
    () => readWith(secretLooking),
    (error) => {
      assert.equal(error.message.includes(secretLooking), false);
      assert.equal(error.message.includes("4242"), false);
      assert.match(error.message, new RegExp(NAME));
      return true;
    },
  );
});

test("parses surrounding whitespace and falls back to the default when unset or empty", () => {
  assert.equal(readWith(" 200 "), 200);
  assert.equal(readWith("15"), 15);
  assert.equal(readWith(undefined, 30), 30);
  assert.equal(readWith("", 30), 30);
  assert.equal(readWith("   ", 30), 30);
});

test("min: 0 allows zero (retries and delay) but still rejects negatives and junk", () => {
  assert.equal(readWith("0", 2, { min: 0 }), 0);
  assert.equal(readWith(" 3 ", 2, { min: 0 }), 3);
  for (const raw of ["-1", "abc", "2.5"]) {
    assert.throws(() => readWith(raw, 2, { min: 0 }), /must be a whole number of at least 0\./);
  }
});

test("the AI client refuses to load with an invalid retry, delay or timeout setting", () => {
  const clientPath = require.resolve("../services/ai/client");
  const cases = [
    ["OPENAI_MAX_RETRIES", "-1", /OPENAI_MAX_RETRIES must be a whole number of at least 0/],
    ["OPENAI_RETRY_BASE_DELAY_MS", "fast", /OPENAI_RETRY_BASE_DELAY_MS must be a whole number of at least 0/],
    ["OPENAI_REQUEST_TIMEOUT_MS", "0", /OPENAI_REQUEST_TIMEOUT_MS must be a whole number of at least 1/],
  ];

  for (const [name, raw, pattern] of cases) {
    process.env[name] = raw;
    delete require.cache[clientPath];
    try {
      assert.throws(() => require("../services/ai/client"), pattern);
    } finally {
      delete process.env[name];
      delete require.cache[clientPath];
    }
  }

  // Zero retries and zero delay are valid.
  process.env.OPENAI_MAX_RETRIES = "0";
  process.env.OPENAI_RETRY_BASE_DELAY_MS = "0";
  try {
    assert.doesNotThrow(() => require("../services/ai/client"));
  } finally {
    delete process.env.OPENAI_MAX_RETRIES;
    delete process.env.OPENAI_RETRY_BASE_DELAY_MS;
    delete require.cache[clientPath];
  }
});
