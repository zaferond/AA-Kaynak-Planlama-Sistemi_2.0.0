import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceNavigation } from "../frontend/src/features/workspace/workspace-navigation.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const state = {
    tab: "risk",
    guard: null,
    valid: true,
    allowed: true,
    exits: 0,
    reloads: 0,
    selected: [],
    errors: [],
    exit: () => Promise.resolve(),
  };
  const navigation = createWorkspaceNavigation({
    getTab: () => state.tab,
    getLeaveGuard: () => state.guard,
    canSelectTab: () => state.allowed,
    assertSession: () => {
      if (!state.valid) throw Error("Synthetic stale session");
      state.onAssert?.();
    },
    selectTab: (tab) => {
      state.tab = tab;
      state.selected.push(tab);
    },
    logout: () => {
      state.exits++;
      return state.exit();
    },
    reload: () => {
      state.reloads++;
    },
    onError: (error) => state.errors.push(error.message),
  });
  return { state, navigation };
}

test("navigation: a declined or invalid risk draft blocks tabs, backup and exit", async () => {
  const { state, navigation } = fixture();
  state.guard = async () => false;
  await navigation.changeTab("projects");
  assert.equal(await navigation.flushRiskDraft(), false);
  await navigation.signOut();
  assert.equal(state.tab, "risk");
  assert.equal(state.exits, 0);
  assert.equal(state.reloads, 0);
  assert.deepEqual(state.errors, []);
});

test("navigation: a successful draft save permits leaving; other tabs do not flush an unrelated guard", async () => {
  const { state, navigation } = fixture();
  let saves = 0;
  state.guard = async () => {
    saves++;
    return true;
  };
  await navigation.changeTab("projects");
  assert.equal(await navigation.flushRiskDraft(), true);
  await navigation.signOut();
  assert.equal(saves, 1);
  assert.equal(state.exits, 1);
  assert.equal(state.reloads, 1);
});

test("navigation: the most recent tab request wins regardless of completion order", async () => {
  const { state, navigation } = fixture();
  const first = deferred(),
    second = deferred();
  state.guard = () => first.promise;
  const older = navigation.changeTab("overview");
  state.guard = () => second.promise;
  const newer = navigation.changeTab("projects");
  second.resolve(true);
  await newer;
  first.resolve(true);
  await older;
  assert.deepEqual(state.selected, ["projects"]);
});

test("navigation: a later declined tab request does not revive an earlier approved request", async () => {
  const { state, navigation } = fixture();
  const first = deferred();
  state.guard = () => first.promise;
  const older = navigation.changeTab("overview");
  state.guard = async () => false;
  await navigation.changeTab("projects");
  first.resolve(true);
  await older;
  assert.deepEqual(state.selected, []);
});

test("navigation: permissions are checked again after the draft save", async () => {
  const { state, navigation } = fixture();
  const saved = deferred();
  state.guard = () => saved.promise;
  const pending = navigation.changeTab("access");
  state.allowed = false;
  saved.resolve(true);
  await pending;
  assert.deepEqual(state.selected, []);
});

test("navigation: changed sessions cannot select a tab, export or send logout after a held draft save", async () => {
  for (const action of ["changeTab", "flushRiskDraft", "signOut"]) {
    const { state, navigation } = fixture();
    const saved = deferred();
    state.guard = () => saved.promise;
    const pending = navigation[action]("projects");
    // signOut registers the shared promise before evaluating the guard.
    await Promise.resolve();
    state.valid = false;
    saved.resolve(true);
    await pending;
    assert.deepEqual(state.selected, []);
    assert.equal(state.exits, 0);
    assert.equal(state.reloads, 0);
    assert.deepEqual(state.errors, []);
  }
});

test("navigation: a rejected guard is reported without an unhandled rejection and blocks leaving", async () => {
  const { state, navigation } = fixture();
  state.guard = async () => {
    throw Error("Synthetic failed draft");
  };
  await navigation.changeTab("projects");
  assert.equal(state.tab, "risk");
  assert.deepEqual(state.errors, ["Synthetic failed draft"]);
});

test("navigation: repeated exit requests share the draft wait and the logout request", async () => {
  const { state, navigation } = fixture();
  const saved = deferred(),
    exited = deferred();
  let saves = 0;
  state.guard = () => {
    saves++;
    return saved.promise;
  };
  state.exit = () => exited.promise;
  const first = navigation.signOut(),
    second = navigation.signOut();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(saves, 1);
  assert.equal(state.exits, 0);
  saved.resolve(true);
  // Wait for the actual transport invocation, not just one guessed microtask.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.exits, 1);
  assert.equal(navigation.signOut(), first);
  assert.equal(await navigation.flushRiskDraft(), false);
  await navigation.changeTab("projects");
  assert.deepEqual(state.selected, []);
  exited.resolve();
  await first;
  assert.equal(state.reloads, 1);
});

test("navigation: a failed exit reports once and allows a later explicit retry", async () => {
  const { state, navigation } = fixture();
  const failed = deferred();
  state.exit = () => failed.promise;
  const first = navigation.signOut(),
    second = navigation.signOut();
  failed.reject(Error("Synthetic failed exit"));
  await Promise.all([first, second]);
  assert.equal(state.exits, 1);
  assert.equal(state.reloads, 0);
  assert.deepEqual(state.errors, ["Synthetic failed exit"]);
  state.exit = async () => {};
  await navigation.signOut();
  assert.equal(state.exits, 2);
  assert.equal(state.reloads, 1);
});

test("navigation: exit supersedes a pending tab request even if exit is declined", async () => {
  const { state, navigation } = fixture();
  const saved = deferred();
  state.guard = () => saved.promise;
  const tab = navigation.changeTab("projects");
  state.guard = async () => false;
  await navigation.signOut();
  saved.resolve(true);
  await tab;
  assert.deepEqual(state.selected, []);
  assert.equal(state.exits, 0);
});

test("navigation: unmount and reactivation do not revive old tab/exit continuations", async () => {
  for (const action of ["changeTab", "signOut"]) {
    const { state, navigation } = fixture();
    const saved = deferred();
    state.guard = () => saved.promise;
    const old = navigation[action]("projects");
    await Promise.resolve();
    navigation.deactivate();
    navigation.activate();
    state.guard = null;
    await navigation.changeTab("actual");
    saved.resolve(true);
    await old;
    assert.deepEqual(state.selected, ["actual"]);
    assert.equal(state.exits, 0);
    assert.equal(state.reloads, 0);
  }
});

test("navigation: an already sent exit cannot reload a replacement workspace", async () => {
  const { state, navigation } = fixture();
  const exited = deferred();
  state.exit = () => exited.promise;
  const pending = navigation.signOut();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.exits, 1);
  navigation.deactivate();
  navigation.activate();
  exited.resolve();
  await pending;
  assert.equal(state.reloads, 0);
});

test("navigation: successful logout may invalidate the session without preventing the login screen reload", async () => {
  const { state, navigation } = fixture();
  state.exit = async () => {
    state.valid = false;
  };
  await navigation.signOut();
  assert.equal(state.exits, 1);
  assert.equal(state.reloads, 1);
  assert.deepEqual(state.errors, []);
});

test("navigation: a session change queued after draft validation still blocks the final tab/exit action", async () => {
  for (const action of ["changeTab", "signOut"]) {
    const { state, navigation } = fixture();
    let checks = 0;
    state.onAssert = () => {
      if (++checks === 2)
        queueMicrotask(() => {
          state.valid = false;
        });
    };
    await navigation[action]("projects");
    assert.deepEqual(state.selected, []);
    assert.equal(state.exits, 0);
    assert.deepEqual(state.errors, []);
  }
});
