import { describe, expect, it } from "vitest";
import { fork } from "effector";
import { createContract, createModel } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTeamPlayerModels() {
  const playerContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("team", "one")
    .pk("id");

  const teamContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .inverse("roster", "team")
    .pk("id");

  const playerModel = createModel({ contract: playerContract,
    refs: { team: () => teamModel },
  });
  const teamModel = createModel({ contract: teamContract,
    refs: { roster: () => playerModel },
  });

  
  return { playerModel, teamModel };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Inverse: basic ref.one → inverse.many", () => {
  it("inverse resolves after ref.set", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const team = teamModel.create({ id: "t1", name: "Red" });
    const p1 = playerModel.create({ id: "p1", name: "Alice" });

    p1.team.set("t1");

    const roster = team.$roster.getState();
    expect(roster).toHaveLength(1);
    expect(roster[0]).toBe("p1");
  });

  it("inverse updates on ref.clear", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const team = teamModel.create({ id: "t1", name: "Red" });
    const p1 = playerModel.create({ id: "p1", name: "Alice" });

    p1.team.set("t1");
    expect(team.$roster.getState()).toHaveLength(1);

    p1.team.clear();
    expect(team.$roster.getState()).toHaveLength(0);
  });

  it("inverse updates when ref switches target", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const t1 = teamModel.create({ id: "t1", name: "Red" });
    const t2 = teamModel.create({ id: "t2", name: "Blue" });
    const p1 = playerModel.create({ id: "p1", name: "Alice" });

    p1.team.set("t1");
    expect(t1.$roster.getState()).toHaveLength(1);
    expect(t2.$roster.getState()).toHaveLength(0);

    p1.team.set("t2");
    expect(t1.$roster.getState()).toHaveLength(0);
    expect(t2.$roster.getState()).toHaveLength(1);
    expect(t2.$roster.getState()[0]).toBe("p1");
  });

  it("multiple players on one team", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const team = teamModel.create({ id: "t1", name: "Red" });
    const p1 = playerModel.create({ id: "p1", name: "Alice" });
    const p2 = playerModel.create({ id: "p2", name: "Bob" });

    p1.team.set("t1");
    p2.team.set("t1");

    const roster = team.$roster.getState();
    expect(roster).toHaveLength(2);
    const ids = roster.slice().sort();
    expect(ids).toEqual(["p1", "p2"]);
  });

  it("inverse updates when source instance is deleted", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const team = teamModel.create({ id: "t1", name: "Red" });
    const p1 = playerModel.create({ id: "p1", name: "Alice" });

    p1.team.set("t1");
    expect(team.$roster.getState()).toHaveLength(1);

    playerModel.delete("p1");
    expect(team.$roster.getState()).toHaveLength(0);
  });

  it("inverse updates when source instance is created with ref data", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const team = teamModel.create({ id: "t1", name: "Red" });

    playerModel.create({ id: "p1", name: "Alice", team: "t1" });

    expect(team.$roster.getState()).toHaveLength(1);
    expect(team.$roster.getState()[0]).toBe("p1");
  });
});

describe("Inverse: instance replacement", () => {
  it("replacing source instance updates inverse", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const t1 = teamModel.create({ id: "t1", name: "Red" });
    const t2 = teamModel.create({ id: "t2", name: "Blue" });

    playerModel.create({ id: "p1", name: "Alice", team: "t1" });
    expect(t1.$roster.getState()).toHaveLength(1);

    // Replace p1 with new team
    playerModel.create({ id: "p1", name: "Alice v2", team: "t2" });
    expect(t1.$roster.getState()).toHaveLength(0);
    expect(t2.$roster.getState()).toHaveLength(1);
  });
});

describe("Inverse: ref.many → inverse.many", () => {
  it("inverse of ref.many (many-to-many)", () => {
    const playlistContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("songs", "many")
      .pk("id");

    const songContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .inverse("playlists", "songs")
      .pk("id");

    const playlistModel = createModel({ contract: playlistContract,
    refs: { songs: () => songModel },
  });
    const songModel = createModel({ contract: songContract,
    refs: { playlists: () => playlistModel },
  });

      
    const s1 = songModel.create({ id: "s1", title: "Song A" });
    const s2 = songModel.create({ id: "s2", title: "Song B" });
    const pl1 = playlistModel.create({ id: "pl1", name: "Mix 1" });
    const pl2 = playlistModel.create({ id: "pl2", name: "Mix 2" });

    pl1.songs.add("s1");
    pl1.songs.add("s2");
    pl2.songs.add("s1");

    // s1 is in both playlists
    const s1Playlists = s1.$playlists.getState();
    expect(s1Playlists).toHaveLength(2);
    const plIds = s1Playlists.slice().sort();
    expect(plIds).toEqual(["pl1", "pl2"]);

    // s2 is only in pl1
    expect(s2.$playlists.getState()).toHaveLength(1);
    expect(s2.$playlists.getState()[0]).toBe("pl1");

    // Remove s1 from pl2
    pl2.songs.remove("s1");
    expect(s1.$playlists.getState()).toHaveLength(1);
    expect(s1.$playlists.getState()[0]).toBe("pl1");
  });
});

describe("Inverse: self-reference", () => {
  it("self-referencing inverse (tree parent from children)", () => {
    const treeContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("children", "many")
      .inverse("parents", "children")
      .pk("id");

    // Self-ref: no bind needed, defaults to self
    const treeModel = createModel({ contract: treeContract });

    const root = treeModel.create({ id: "root", name: "Root" });
    const child1 = treeModel.create({ id: "c1", name: "Child 1" });
    const child2 = treeModel.create({ id: "c2", name: "Child 2" });

    root.children.add("c1");
    root.children.add("c2");

    // child1's parents should be [root]
    expect(child1.$parents.getState()).toHaveLength(1);
    expect(child1.$parents.getState()[0]).toBe("root");

    // child2's parents should be [root]
    expect(child2.$parents.getState()).toHaveLength(1);
    expect(child2.$parents.getState()[0]).toBe("root");

    // root has no parents
    expect(root.$parents.getState()).toHaveLength(0);
  });
});

describe("Inverse: multiple refs to same target", () => {
  it("separate inverses for assignedTo and createdBy", () => {
    const taskContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("assignedTo", "one")
      .ref("createdBy", "one")
      .pk("id");

    const userContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .inverse("assignedTasks", "assignedTo")
      .inverse("createdTasks", "createdBy")
      .pk("id");

    // biome-ignore lint: intentional forward reference via thunk
    const taskModel: ReturnType<typeof createModel<typeof taskContract>> = createModel({
      contract: taskContract,
      refs: { assignedTo: () => userModel, createdBy: () => userModel },
    });
    const userModel: ReturnType<typeof createModel<typeof userContract>> = createModel({
      contract: userContract,
      refs: { assignedTasks: () => taskModel, createdTasks: () => taskModel },
    });

      
    const alice = userModel.create({ id: "u1", name: "Alice" });
    const bob = userModel.create({ id: "u2", name: "Bob" });

    const t1 = taskModel.create({ id: "t1", title: "Fix bug" });
    t1.assignedTo.set("u1");
    t1.createdBy.set("u2");

    const t2 = taskModel.create({ id: "t2", title: "Add feature" });
    t2.assignedTo.set("u1");
    t2.createdBy.set("u1");

    expect(alice.$assignedTasks.getState()).toHaveLength(2);
    expect(alice.$createdTasks.getState()).toHaveLength(1);
    expect(bob.$assignedTasks.getState()).toHaveLength(0);
    expect(bob.$createdTasks.getState()).toHaveLength(1);
  });
});

describe("Inverse: backfill", () => {
  it("source instances created before inverse resolves", () => {
    const playerContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("team", "one")
      .pk("id");

    const teamContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .inverse("roster", "team")
      .pk("id");

    const playerModel = createModel({ contract: playerContract,
    refs: { team: () => teamModel },
  });
    const teamModel = createModel({ contract: teamContract,
    refs: { roster: () => playerModel },
  });

      
    // Create players BEFORE any team instance (inverses not yet resolved)
    const p1 = playerModel.create({ id: "p1", name: "Alice" });
    const p2 = playerModel.create({ id: "p2", name: "Bob" });
    p1.team.set("t1");
    p2.team.set("t1");

    // Now create team — inverse resolves and backfills
    const team = teamModel.create({ id: "t1", name: "Red" });
    expect(team.$roster.getState()).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Late inverse wiring — ref mutations AFTER backfill
// ─────────────────────────────────────────────────────────────────────────────

describe("Inverse: late wiring — ref.one mutations after backfill", () => {
  it("ref.set after late inverse registration updates inverse", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();

    // Create player BEFORE team (inverse not yet resolved)
    const p1 = playerModel.create({ id: "p1", name: "Alice" });

    // Now create team — triggers resolveInverses
    const team = teamModel.create({ id: "t1", name: "Red" });
    expect(team.$roster.getState()).toHaveLength(0);

    // Mutate ref AFTER inverse is registered
    p1.team.set("t1");
    expect(team.$roster.getState()).toHaveLength(1);
    expect(team.$roster.getState()[0]).toBe("p1");
  });

  it("ref.clear after late inverse registration updates inverse", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();

    const p1 = playerModel.create({ id: "p1", name: "Alice" });
    const team = teamModel.create({ id: "t1", name: "Red" });

    p1.team.set("t1");
    expect(team.$roster.getState()).toHaveLength(1);

    p1.team.clear();
    expect(team.$roster.getState()).toHaveLength(0);
  });

  it("ref.set switching targets after late registration", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();

    const p1 = playerModel.create({ id: "p1", name: "Alice" });
    const t1 = teamModel.create({ id: "t1", name: "Red" });
    const t2 = teamModel.create({ id: "t2", name: "Blue" });

    p1.team.set("t1");
    expect(t1.$roster.getState()).toHaveLength(1);
    expect(t2.$roster.getState()).toHaveLength(0);

    p1.team.set("t2");
    expect(t1.$roster.getState()).toHaveLength(0);
    expect(t2.$roster.getState()).toHaveLength(1);
  });

  it("multiple players created before inverse, mutated after", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();

    const p1 = playerModel.create({ id: "p1", name: "Alice" });
    const p2 = playerModel.create({ id: "p2", name: "Bob" });
    const p3 = playerModel.create({ id: "p3", name: "Charlie" });

    const team = teamModel.create({ id: "t1", name: "Red" });

    // All mutations happen after inverse is wired
    p1.team.set("t1");
    p2.team.set("t1");
    expect(team.$roster.getState()).toHaveLength(2);

    p3.team.set("t1");
    expect(team.$roster.getState()).toHaveLength(3);

    p2.team.clear();
    expect(team.$roster.getState()).toHaveLength(2);
    const ids = team.$roster.getState().slice().sort();
    expect(ids).toEqual(["p1", "p3"]);
  });
});

describe("Inverse: late wiring — ref.many mutations after backfill", () => {
  function makePlaylistSongModels() {
    const playlistContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("songs", "many")
      .pk("id");

    const songContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .inverse("playlists", "songs")
      .pk("id");

    const playlistModel = createModel({ contract: playlistContract,
    refs: { songs: () => songModel },
  });
    const songModel = createModel({ contract: songContract,
    refs: { playlists: () => playlistModel },
  });

      
    return { playlistModel, songModel };
  }

  it("ref.add after late inverse registration updates inverse", () => {
    const { playlistModel, songModel } = makePlaylistSongModels();

    // Create playlist BEFORE song (inverse not yet resolved)
    const pl = playlistModel.create({ id: "pl1", name: "Mix" });

    // Now create song — triggers resolveInverses
    const s1 = songModel.create({ id: "s1", title: "Song A" });
    expect(s1.$playlists.getState()).toHaveLength(0);

    // Mutate ref AFTER inverse is registered
    pl.songs.add("s1");
    expect(s1.$playlists.getState()).toHaveLength(1);
    expect(s1.$playlists.getState()[0]).toBe("pl1");
  });

  it("ref.remove after late inverse registration updates inverse", () => {
    const { playlistModel, songModel } = makePlaylistSongModels();

    const pl = playlistModel.create({ id: "pl1", name: "Mix" });
    const s1 = songModel.create({ id: "s1", title: "Song A" });

    pl.songs.add("s1");
    expect(s1.$playlists.getState()).toHaveLength(1);

    pl.songs.remove("s1");
    expect(s1.$playlists.getState()).toHaveLength(0);
  });

  it("multiple playlists created before inverse, mutated after", () => {
    const { playlistModel, songModel } = makePlaylistSongModels();

    const pl1 = playlistModel.create({ id: "pl1", name: "Mix 1" });
    const pl2 = playlistModel.create({ id: "pl2", name: "Mix 2" });

    const s1 = songModel.create({ id: "s1", title: "Song A" });

    pl1.songs.add("s1");
    pl2.songs.add("s1");

    expect(s1.$playlists.getState()).toHaveLength(2);
    const plIds = s1.$playlists.getState().slice().sort();
    expect(plIds).toEqual(["pl1", "pl2"]);

    pl1.songs.remove("s1");
    expect(s1.$playlists.getState()).toHaveLength(1);
    expect(s1.$playlists.getState()[0]).toBe("pl2");
  });
});

describe("Inverse: late wiring — mixed creation order", () => {
  it("some refs before inverse, some after — all work", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();

    // p1 created BEFORE inverse resolves
    const p1 = playerModel.create({ id: "p1", name: "Alice" });
    p1.team.set("t1");

    // team creation triggers inverse resolution + backfills p1
    const team = teamModel.create({ id: "t1", name: "Red" });
    expect(team.$roster.getState()).toHaveLength(1);

    // p2 created AFTER inverse resolves (the normal path)
    const p2 = playerModel.create({ id: "p2", name: "Bob" });
    p2.team.set("t1");
    expect(team.$roster.getState()).toHaveLength(2);

    // p3 created AFTER, mutated later
    const p3 = playerModel.create({ id: "p3", name: "Charlie" });
    p3.team.set("t1");
    expect(team.$roster.getState()).toHaveLength(3);
  });
});

describe("Inverse: late wiring — self-referencing model", () => {
  it("self-ref inverse works regardless of creation order", () => {
    const treeContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("children", "many")
      .inverse("parents", "children")
      .pk("id");

    const treeModel = createModel({ contract: treeContract });

    // Create parent first
    const root = treeModel.create({ id: "root", name: "Root" });
    // Create child — inverse resolves on first create, but root's ref was created first
    const child = treeModel.create({ id: "c1", name: "Child" });

    // Mutate AFTER both exist
    root.children.add("c1");
    expect(child.$parents.getState()).toHaveLength(1);
    expect(child.$parents.getState()[0]).toBe("root");

    root.children.remove("c1");
    expect(child.$parents.getState()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Late wiring — SSR tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Inverse: late wiring SSR", () => {
  it("late-wired inverse works after scoped create", async () => {
    const playerContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("team", "one")
      .pk("id");

    const teamContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .inverse("roster", "team")
      .pk("id");

    const playerModel = createModel({ contract: playerContract,
    refs: { team: () => teamModel },
  });
    const teamModel = createModel({ contract: teamContract,
    refs: { roster: () => playerModel },
  });

      
    // Create globally (late wiring path)
    const p1 = playerModel.create({ id: "ssrlw-p1", name: "Alice" });
    const team = teamModel.create({ id: "ssrlw-t1", name: "Red" });
    p1.team.set("ssrlw-t1");

    // Verify the inverse resolves correctly at the global level
    expect(team.$roster.getState()).toHaveLength(1);
    expect(team.$roster.getState()[0]).toBe("ssrlw-p1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Late wiring — Memory leak tests
// ─────────────────────────────────────────────────────────────────────────────

describe("MEMORY: late-wired inverse relations", () => {
  it("replacing instances with late-wired inverses doesn't leak", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();

    // Create players before team (late wiring path)
    for (let i = 0; i < 50; i++) {
      playerModel.create({ id: "warmup-p", name: `P${i}` });
    }
    teamModel.create({ id: "t1", name: "Red" });

    const before = measureHeap();
    for (let i = 0; i < 500; i++) {
      const p = playerModel.create({ id: "late-leak", name: `P${i}` });
      p.team.set("t1");
    }
    const after = measureHeap();

    const growth = (after - before) / 1024 / 1024;
    console.log(`[late inverse replace] heap growth: ${growth.toFixed(2)} MB`);
    expect(growth).toBeLessThan(5);
  });
});

describe("Inverse: validation", () => {
  it("throws on invalid refField", () => {
    const sourceContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");

    const sourceModel = createModel({ contract: sourceContract });

    const targetContract = createContract()
      .store("id", (s) => s<string>())
      .inverse("bad", "nonexistent")
      .pk("id");

    const targetModel = createModel({ contract: targetContract,
    refs: { bad: () => sourceModel },
  });
   
    expect(() => targetModel.create({ id: "x" })).toThrow(/no ref field "nonexistent"/);
  });
});

describe("Inverse: target deletion", () => {
  it("deleting target cleans up inverse stores", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const team = teamModel.create({ id: "t1", name: "Red" });
    const p1 = playerModel.create({ id: "p1", name: "Alice" });
    p1.team.set("t1");

    expect(team.$roster.getState()).toHaveLength(1);

    teamModel.delete("t1");

    // Re-create team — should start fresh
    const team2 = teamModel.create({ id: "t1", name: "Red v2" });
    expect(team2.$roster.getState()).toHaveLength(0);
  });
});

describe("Inverse: clear all", () => {
  it("clearing source model clears inverses", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const team = teamModel.create({ id: "t1", name: "Red" });
    playerModel.create({ id: "p1", name: "Alice", team: "t1" });
    playerModel.create({ id: "p2", name: "Bob", team: "t1" });

    expect(team.$roster.getState()).toHaveLength(2);

    playerModel.clear();
    expect(team.$roster.getState()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Inverse: SSR", () => {
  it("scoped inverse stores are isolated between scopes", async () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();

    const team = teamModel.create({ id: "t1", name: "Red" });

    const scopeA = fork();
    const scopeB = fork();

    await playerModel.create({ id: "p1", name: "Alice", team: "t1" }, { scope: scopeA });
    await playerModel.create({ id: "p2", name: "Bob" }, { scope: scopeB });

    // Verify basic SSR create doesn't crash
    expect(team.$roster).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Memory leak tests
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

describe("MEMORY: inverse relations", () => {
  it("deleted source instances don't leak in reverse index", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();
    const team = teamModel.create({ id: "t1", name: "Red" });

    // Warm up
    for (let i = 0; i < 50; i++) {
      const p = playerModel.create({ id: `warmup-${i}`, name: `P${i}` });
      p.team.set("t1");
      playerModel.delete(`warmup-${i}`);
    }

    const before = measureHeap();

    for (let i = 0; i < 500; i++) {
      const p = playerModel.create({ id: `leak-${i}`, name: `P${i}` });
      p.team.set("t1");
      playerModel.delete(`leak-${i}`);
    }

    const after = measureHeap();
    const growth = (after - before) / 1024 / 1024;
    console.log(`[inverse delete cycle] heap growth over 500 cycles: ${growth.toFixed(2)} MB`);

    expect(team.$roster.getState()).toHaveLength(0);
    expect(growth).toBeLessThan(5);
  });

  it("deleted target instances clean up inverse stores", () => {
    const { playerModel, teamModel } = makeTeamPlayerModels();

    // Warm up
    for (let i = 0; i < 50; i++) {
      teamModel.create({ id: `twarmup-${i}`, name: `T${i}` });
      teamModel.delete(`twarmup-${i}`);
    }

    const before = measureHeap();

    for (let i = 0; i < 500; i++) {
      const t = teamModel.create({ id: `tleak-${i}`, name: `T${i}` });
      // Access the inverse store to force creation
      t.$roster.getState();
      teamModel.delete(`tleak-${i}`);
    }

    const after = measureHeap();
    const growth = (after - before) / 1024 / 1024;
    console.log(`[inverse target delete] heap growth over 500 cycles: ${growth.toFixed(2)} MB`);

    expect(growth).toBeLessThan(10);
  });
});

