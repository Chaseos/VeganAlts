import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { ProfilesService } from "../../server/profiles/application/service";
import { DrizzleProfilesRepository } from "../../server/profiles/infrastructure/drizzle-repository";

it("links profiles once under concurrent creation and retries public-handle collisions", async () => {
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  await env.DB.batch(
    ids.map((id) =>
      env.DB.prepare(
        "INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,1,1)",
      ).bind(id, "Private provider name", `${id}@example.invalid`),
    ),
  );
  const repository = new DrizzleProfilesRepository(env.DB);
  let attempt = 0;
  const service = new ProfilesService(repository, () =>
    ++attempt <= 2 ? "0000000000000000" : crypto.randomUUID(),
  );
  const first = await service.ensureProfile(ids[0]!);
  const second = await service.ensureProfile(ids[1]!);
  expect(first.handle).not.toBe(second.handle);
  expect(first.displayName).toBeNull();
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () => service.ensureProfile(ids[1]!)),
  );
  expect(concurrent.every((profile) => profile.handle === second.handle)).toBe(
    true,
  );
  await service.update(ids[0]!, {
    handle: "Fresh_Handle",
    displayName: "My public name",
  });
  await expect(
    service.update(ids[1]!, { handle: "FRESH_HANDLE", displayName: "" }),
  ).rejects.toMatchObject({ code: "HANDLE_TAKEN" });
  await expect(
    service.update(ids[0]!, { handle: "admin", displayName: "" }),
  ).rejects.toMatchObject({ code: "INVALID_HANDLE" });
  expect((await repository.find(ids[0]!))?.handle).toBe("fresh_handle");
});
