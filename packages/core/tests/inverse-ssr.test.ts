import { allSettled, fork, serialize } from "effector";
import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { InstanceCache } from "../layers/model/instance-cache";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5b SSR tests.
//
// The core Phase 5b promise: an inverse field (e.g. `team.$roster`) returns
// the right source rows when the scope is hydrated via `fork({values})` and
// the global instance cache is empty. Prior to Phase 5b the inverse was an
// imperative `Map<targetId, Set<sourceId>>` populated only by the create
// path, so SSR-hydrated data produced silent empty results.
//
// `wipeGlobalCache` replaces the Model's InstanceCache with a fresh one to
// simulate a separate client process that never imperatively populated the
// cache. Scoped store values are untouched.
// ─────────────────────────────────────────────────────────────────────────────

function wipeGlobalCache(model: unknown): void {
  (model as { cache: InstanceCache<unknown> }).cache = new InstanceCache();
}

function makeTeamPlayerModels(namespace: string) {
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

  const playerModel = createModel({ contract: playerContract, name: `${namespace}-player` });
  const teamModel = createModel({ contract: teamContract, name: `${namespace}-team` });

  playerModel.bind({ team: () => teamModel });
  teamModel.bind({ roster: () => playerModel });

  return { playerModel, teamModel };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 5b — inverse refs over SSR-hydrated fork({values})", () => {
  it("team.$roster returns hydrated players in the client scope", async () => {
    const { playerModel, teamModel } = makeTeamPlayerModels("phase5b-hydrate");

    const serverScope = fork();
    await allSettled(teamModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "t1", name: "Red" },
        { id: "t2", name: "Blue" },
      ],
    });
    await allSettled(playerModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "p1", name: "Alice", team: "t1" },
        { id: "p2", name: "Bob", team: "t1" },
        { id: "p3", name: "Carol", team: "t2" },
      ],
    });

    const values = serialize(serverScope);
    const clientScope = fork({ values });

    wipeGlobalCache(playerModel);
    wipeGlobalCache(teamModel);

    const team1 = clientScope.getState(teamModel.instance("t1"));
    const team2 = clientScope.getState(teamModel.instance("t2"));
    expect(team1).not.toBeNull();
    expect(team2).not.toBeNull();

    const t1Ids = clientScope
      .getState(team1!.$roster)
      .map((p: { __id: string }) => p.__id)
      .sort();
    const t2Ids = clientScope
      .getState(team2!.$roster)
      .map((p: { __id: string }) => p.__id)
      .sort();

    expect(t1Ids).toEqual(["p1", "p2"]);
    expect(t2Ids).toEqual(["p3"]);
  });

  it("empty inverse returns [] for a hydrated target with no sources", async () => {
    const { playerModel, teamModel } = makeTeamPlayerModels("phase5b-empty");

    const serverScope = fork();
    await allSettled(teamModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "t1", name: "Red" },
        { id: "t2", name: "Blue" },
      ],
    });
    await allSettled(playerModel.createManyFx, {
      scope: serverScope,
      params: [{ id: "p1", name: "Alice", team: "t1" }],
    });

    const values = serialize(serverScope);
    const clientScope = fork({ values });

    wipeGlobalCache(playerModel);
    wipeGlobalCache(teamModel);

    const team2 = clientScope.getState(teamModel.instance("t2"));
    expect(team2).not.toBeNull();
    expect(clientScope.getState(team2!.$roster)).toEqual([]);
  });

  it("scope isolation — two hydrated scopes with different source data", async () => {
    const { playerModel, teamModel } = makeTeamPlayerModels("phase5b-iso");

    // Server scope A: team t1 has p1
    const serverScopeA = fork();
    await allSettled(teamModel.createManyFx, {
      scope: serverScopeA,
      params: [{ id: "t1", name: "Red" }],
    });
    await allSettled(playerModel.createManyFx, {
      scope: serverScopeA,
      params: [{ id: "p1", name: "Alice", team: "t1" }],
    });
    const valuesA = serialize(serverScopeA);

    // Server scope B: team t1 has p1 and p2
    const serverScopeB = fork();
    await allSettled(teamModel.createManyFx, {
      scope: serverScopeB,
      params: [{ id: "t1", name: "Red" }],
    });
    await allSettled(playerModel.createManyFx, {
      scope: serverScopeB,
      params: [
        { id: "p1", name: "Alice", team: "t1" },
        { id: "p2", name: "Bob", team: "t1" },
      ],
    });
    const valuesB = serialize(serverScopeB);

    const clientA = fork({ values: valuesA });
    const clientB = fork({ values: valuesB });

    wipeGlobalCache(playerModel);
    wipeGlobalCache(teamModel);

    const teamA = clientA.getState(teamModel.instance("t1"));
    const teamB = clientB.getState(teamModel.instance("t1"));
    expect(teamA).not.toBeNull();
    expect(teamB).not.toBeNull();

    const aIds = clientA
      .getState(teamA!.$roster)
      .map((p: { __id: string }) => p.__id)
      .sort();
    const bIds = clientB
      .getState(teamB!.$roster)
      .map((p: { __id: string }) => p.__id)
      .sort();

    expect(aIds).toEqual(["p1"]);
    expect(bIds).toEqual(["p1", "p2"]);
  });

  it("ref.many inverse (many-to-many) resolves in hydrated scope", async () => {
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

    const playlistModel = createModel({ contract: playlistContract, name: "phase5b-m2m-pl" });
    const songModel = createModel({ contract: songContract, name: "phase5b-m2m-sg" });
    playlistModel.bind({ songs: () => songModel });
    songModel.bind({ playlists: () => playlistModel });

    const serverScope = fork();
    await allSettled(songModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "s1", title: "Song 1" },
        { id: "s2", title: "Song 2" },
      ],
    });
    await allSettled(playlistModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "pl1", name: "Mix A", songs: { connect: ["s1", "s2"] } as any },
        { id: "pl2", name: "Mix B", songs: { connect: ["s1"] } as any },
      ],
    });

    const values = serialize(serverScope);
    const clientScope = fork({ values });

    wipeGlobalCache(playlistModel);
    wipeGlobalCache(songModel);

    const s1 = clientScope.getState(songModel.instance("s1"));
    const s2 = clientScope.getState(songModel.instance("s2"));
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();

    const s1Playlists = clientScope
      .getState(s1!.$playlists)
      .map((p: { __id: string }) => p.__id)
      .sort();
    const s2Playlists = clientScope
      .getState(s2!.$playlists)
      .map((p: { __id: string }) => p.__id)
      .sort();

    expect(s1Playlists).toEqual(["pl1", "pl2"]);
    expect(s2Playlists).toEqual(["pl1"]);
  });
});
