import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import React from "react";

export function render(_url: string): { html: string } {
  return { html: "" };
}
