import { describe, expect, it } from "vitest";
import firebaseConfig from "./firebase.json";

describe("firebase.json", () => {
  it("configures Cloud Functions from the dedicated functions directory", () => {
    expect(firebaseConfig).toHaveProperty("functions.source", "functions");
  });
});
