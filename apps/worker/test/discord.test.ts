import { describe, expect, test } from "bun:test";
import { makeDiscordSigner, makeHarness, type Harness, type DiscordSigner } from "./helpers";

async function postInteraction(
  harness: Harness,
  signer: DiscordSigner,
  payload: Record<string, unknown>,
  overrides: { signature?: string; timestamp?: string } = {},
): Promise<Response> {
  const raw = JSON.stringify(payload);
  const signed = await signer.sign(raw);

  return harness.app.request(
    "/discord/interactions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": overrides.signature ?? signed.signature,
        "x-signature-timestamp": overrides.timestamp ?? signed.timestamp,
      },
      body: raw,
    },
    { ...harness.env, DISCORD_PUBLIC_KEY: signer.publicKeyHex } as typeof harness.env,
  );
}

describe("discord interactions", () => {
  test("answers the ping handshake", async () => {
    const harness = makeHarness();
    const signer = await makeDiscordSigner();

    const response = await postInteraction(harness, signer, { type: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
  });

  test("rejects a bad signature", async () => {
    const harness = makeHarness();
    const signer = await makeDiscordSigner();

    const response = await postInteraction(harness, signer, { type: 1 }, { signature: "00".repeat(64) });
    expect(response.status).toBe(401);
  });

  test("/key issues a free key and enforces the daily cooldown", async () => {
    const harness = makeHarness();
    const signer = await makeDiscordSigner();

    const first = await postInteraction(harness, signer, {
      type: 2,
      data: { name: "key" },
      member: { user: { id: "4242" } },
    });
    expect(first.status).toBe(200);
    const firstPayload = await first.json();
    expect(firstPayload.data.content).toContain("APL-");
    expect(firstPayload.data.flags).toBe(64);

    const second = await postInteraction(harness, signer, {
      type: 2,
      data: { name: "key" },
      member: { user: { id: "4242" } },
    });
    const secondPayload = await second.json();
    expect(secondPayload.data.content).toContain("sudah klaim");
  });

  test("cooldown expires after a day", async () => {
    const harness = makeHarness();
    const signer = await makeDiscordSigner();

    await postInteraction(harness, signer, {
      type: 2,
      data: { name: "key" },
      member: { user: { id: "777" } },
    });

    harness.advance(86_400_000 + 1);

    const again = await postInteraction(harness, signer, {
      type: 2,
      data: { name: "key" },
      member: { user: { id: "777" } },
    });
    const payload = await again.json();
    expect(payload.data.content).toContain("APL-");
    expect(payload.data.content).not.toContain("sudah klaim");
  });

  test("/help points at the loader", async () => {
    const harness = makeHarness();
    const signer = await makeDiscordSigner();

    const response = await postInteraction(
      harness,
      signer,
      { type: 2, data: { name: "help" }, user: { id: "1" } },
    );
    const payload = await response.json();
    expect(payload.data.content).toContain("/loader");
  });
});
