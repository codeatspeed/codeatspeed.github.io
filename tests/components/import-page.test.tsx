import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/app/App";

describe("public reader shell", () => {
  it("mounts the public reader shell", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
