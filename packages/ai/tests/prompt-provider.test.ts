import { describe, expect, test } from "bun:test";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { PromptProvider } from "../src/prompt-provider";
import { PROMPT_NAMES, hubSlugForPrompt } from "../src/prompt-catalog";

describe("PromptProvider.get", () => {
  test("loads every catalog prompt from local files", async () => {
    const prompts = new PromptProvider();
    for (const name of PROMPT_NAMES) {
      const template = await prompts.get(name);
      expect(template).toBeInstanceOf(ChatPromptTemplate);
    }
    const generate = await prompts.get("chat.generate");
    expect(generate.inputVariables.sort()).toEqual(["context", "question"]);
  });

  test("rejects an unknown prompt name", async () => {
    const prompts = new PromptProvider();
    await expect(prompts.get("chat.invented")).rejects.toThrow(/Unknown prompt/);
  });

  test("falls back to the local catalog when Hub pull fails", async () => {
    const prompts = new PromptProvider(async () => {
      throw new Error("hub down");
    });
    const template = await prompts.get("chat.generate");
    expect(template).toBeInstanceOf(ChatPromptTemplate);
  });

  test("uses the Hub template when pull succeeds", async () => {
    const fromHub = ChatPromptTemplate.fromMessages([
      ["human", "hub {question}"],
    ]);
    const prompts = new PromptProvider(async (slug) => {
      expect(slug).toBe(hubSlugForPrompt("chat.generate"));
      return fromHub;
    });
    expect(await prompts.get("chat.generate")).toBe(fromHub);
  });
});
