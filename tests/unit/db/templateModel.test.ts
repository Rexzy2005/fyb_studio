import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function deleteTemplateModel() {
  try {
    mongoose.deleteModel("Template");
  } catch {
    // Model was not compiled in this test process.
  }
}

beforeEach(() => {
  vi.resetModules();
  deleteTemplateModel();
});

afterEach(() => {
  deleteTemplateModel();
  vi.resetModules();
});

describe("Template model", () => {
  it("recompiles a cached schema that still requires designJson", async () => {
    mongoose.model(
      "Template",
      new mongoose.Schema({
        name: { type: String, required: true },
        fieldConfig: { type: mongoose.Schema.Types.Mixed, required: true },
        designJson: { type: mongoose.Schema.Types.Mixed, required: true },
        cover: {
          url: { type: String, required: true },
          publicId: { type: String, required: true },
        },
        createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
      })
    );

    const { Template } = await import("@/backend/db/models/template.model");
    const designJsonPath = Template.schema.path("designJson") as
      | { isRequired?: boolean; validators?: Array<{ type?: string }> }
      | undefined;

    expect(designJsonPath?.isRequired).not.toBe(true);
    expect(designJsonPath?.validators?.some((validator) => validator.type === "required")).toBe(
      false
    );

    const doc = new Template({
      name: "FYB Template",
      fieldConfig: { version: 1, fields: [] },
      cover: { url: "https://res.cloudinary.com/demo/image/upload/cover.png", publicId: "cover" },
      createdBy: new mongoose.Types.ObjectId(),
    });

    await expect(doc.validate()).resolves.toBeUndefined();
  });
});
