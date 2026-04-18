import { describe, expect, it } from "vitest";
import firebaseConfig from "./firebase.json";

describe("firebase.json", () => {
  it("does not configure Cloud Functions when the app no longer uses them", () => {
    expect(firebaseConfig).not.toHaveProperty("functions");
  });
});
